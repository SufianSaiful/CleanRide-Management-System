import os
import time
import random
import datetime
from decimal import Decimal
from flask import Flask, request, jsonify, send_from_directory
from flask.json.provider import DefaultJSONProvider
from flask_cors import CORS
import mysql.connector
from mysql.connector import pooling, Error
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash

# 1. Load environment variables from .env using absolute directory path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "cleanridedb")
DB_PORT = int(os.getenv("DB_PORT", 3307))
ADMIN_SECURITY_CODE = os.getenv("ADMIN_SECURITY_CODE", "2006")

# 2. Custom JSON provider to serialize Decimal, Date, Datetime, and Time types from MySQL
class CustomJSONProvider(DefaultJSONProvider):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, (datetime.date, datetime.datetime)):
            return obj.isoformat()
        if isinstance(obj, datetime.time):
            return obj.strftime("%H:%M")
        if isinstance(obj, datetime.timedelta):
            return str(obj)
        return super().default(obj)

# 3. Initialize Flask App and CORS
app = Flask(__name__, static_folder=".", static_url_path="")
app.json = CustomJSONProvider(app)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# 4. Resilient Database Connection Management
db_pool = None
ACTIVE_PORT = DB_PORT
ACTIVE_DB = DB_NAME

def init_connection_pool():
    """Initializes connection pool, trying primary and fallback ports (3307 / 3306) and DB names."""
    global db_pool, ACTIVE_PORT, ACTIVE_DB

    ports_to_try = [DB_PORT]
    if 3307 not in ports_to_try:
        ports_to_try.append(3307)
    if 3306 not in ports_to_try:
        ports_to_try.append(3306)

    dbs_to_try = [DB_NAME]
    for alt_db in ["cleanridedb", "cleanride_db"]:
        if alt_db not in dbs_to_try:
            dbs_to_try.append(alt_db)

    for port in ports_to_try:
        for db in dbs_to_try:
            try:
                pool = pooling.MySQLConnectionPool(
                    pool_name="cleanride_pool",
                    pool_size=5,
                    pool_reset_session=True,
                    host=DB_HOST,
                    user=DB_USER,
                    password=DB_PASSWORD,
                    database=db,
                    port=port,
                )
                test_conn = pool.get_connection()
                test_conn.close()
                db_pool = pool
                ACTIVE_PORT = port
                ACTIVE_DB = db
                print(f"[*] Successfully connected to MySQL database '{db}' on port {port}")
                return
            except Error:
                continue

    print(f"[!] Warning: Could not connect to MySQL on ports {ports_to_try} with databases {dbs_to_try}.")
    print("[!] Please check that MySQL is started in XAMPP.")

# Attempt initialization at startup
init_connection_pool()

def get_db_connection():
    """Acquires a database connection, re-initializing the pool if needed."""
    global db_pool
    if not db_pool:
        init_connection_pool()
    if not db_pool:
        raise Error("Database connection pool is not initialized. Ensure MySQL is running.")
    return db_pool.get_connection()

def ensure_user_exists(cursor, user_id=None, name=None, email=None, phone=None):
    """
    Ensures that a user record exists in the users table to prevent Foreign Key constraint violations.
    Returns the confirmed user_id.
    """
    if user_id:
        cursor.execute("SELECT id FROM users WHERE id = %s LIMIT 1", (user_id,))
        row = cursor.fetchone()
        if row:
            return user_id

    if email:
        cursor.execute("SELECT id FROM users WHERE email = %s LIMIT 1", (email.strip().lower(),))
        row = cursor.fetchone()
        if row:
            return row["id"]

    # If neither user_id nor email matches an existing user, create a customer user record
    new_user_id = user_id or f"USR-{int(time.time())}-{random.randint(100, 999)}"
    safe_name = (name or "Customer").strip()
    safe_email = (email or f"{new_user_id.lower()}@cleanride.local").strip().lower()
    safe_phone = (phone or "012-3456789").strip()
    default_pw_hash = generate_password_hash("cleanride123")

    cursor.execute("""
        INSERT INTO users (id, name, email, phone, password_hash, role)
        VALUES (%s, %s, %s, %s, %s, 'customer')
    """, (new_user_id, safe_name, safe_email, safe_phone, default_pw_hash))

    return new_user_id

def normalize_equipment_condition(cond):
    """Maps user condition values to exact MySQL CHECK constraint: ('New', 'Good', 'Fair', 'Needs Service')"""
    mapping = {
        "new": "New",
        "excellent": "New",
        "good": "Good",
        "fair": "Fair",
        "needs service": "Needs Service",
        "damaged": "Needs Service"
    }
    return mapping.get(str(cond or "").strip().lower(), "Good")

def normalize_equipment_status(st):
    """Maps user status values to exact MySQL CHECK constraint: ('Available', 'In Use', 'Maintenance')"""
    mapping = {
        "available": "Available",
        "in use": "In Use",
        "maintenance": "Maintenance",
        "retired": "Maintenance"
    }
    return mapping.get(str(st or "").strip().lower(), "Available")


# --------------------------------------------------------------------------
# Health Check Endpoint
# --------------------------------------------------------------------------

@app.route("/api/health", methods=["GET"])
def health_check():
    """Health check endpoint to test API and Database connectivity."""
    db_status = "disconnected"
    try:
        conn = get_db_connection()
        if conn.is_connected():
            db_status = f"connected (port {ACTIVE_PORT}, db '{ACTIVE_DB}')"
            conn.close()
    except Exception as e:
        db_status = f"error: {str(e)}"

    return jsonify({"status": "running", "database": db_status}), 200


# --------------------------------------------------------------------------
# Authentication Endpoints
# --------------------------------------------------------------------------

@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    """
    POST /api/auth/login
    Authenticates user or owner against the MySQL database.
    """
    payload = request.get_json(silent=True) or {}
    username_or_email = str(payload.get("username") or payload.get("email") or "").strip()
    password = str(payload.get("password") or "")

    if not username_or_email or not password:
        return jsonify({"success": False, "error": "Username/Email and password are required."}), 400

    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # 1. Check `owners` table first
        try:
            cursor.execute("SELECT id, username, password_hash FROM owners WHERE username = %s LIMIT 1", (username_or_email,))
            owner = cursor.fetchone()
            if owner:
                password_valid = check_password_hash(owner["password_hash"], password) or owner["password_hash"] == password
                if password_valid:
                    return jsonify({
                        "success": True,
                        "role": "owner",
                        "requires_code": True,
                        "username": owner["username"],
                        "message": "Admin credentials verified. Enter 4-digit code."
                    }), 200
                else:
                    return jsonify({"success": False, "error": "Invalid username or password."}), 401
        except Error:
            pass

        # 2. Check `users` table
        cursor.execute("SELECT id, name, email, password_hash, role FROM users WHERE email = %s OR name = %s LIMIT 1", (username_or_email, username_or_email))
        user = cursor.fetchone()
        if user:
            password_valid = check_password_hash(user["password_hash"], password) or user["password_hash"] == password
            if password_valid:
                if user["role"] == "owner":
                    return jsonify({
                        "success": True,
                        "role": "owner",
                        "requires_code": True,
                        "username": user["name"],
                        "message": "Admin credentials verified. Enter 4-digit code."
                    }), 200
                else:
                    return jsonify({
                        "success": True,
                        "role": "customer",
                        "requires_code": False,
                        "user": {
                            "id": user["id"],
                            "name": user["name"],
                            "email": user["email"],
                            "role": user["role"]
                        }
                    }), 200

        return jsonify({"success": False, "error": "Invalid username or password."}), 401

    except Error as err:
        print(f"[!] MySQL Error in /api/auth/login: {err}")
        return jsonify({"success": False, "error": "Database error", "details": str(err)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


@app.route("/api/auth/verify-admin-code", methods=["POST"])
def verify_admin_code():
    """
    POST /api/auth/verify-admin-code
    Validates the 4-digit security code stored in server environment.
    """
    payload = request.get_json(silent=True) or {}
    code = str(payload.get("code") or "").strip()
    username = str(payload.get("username") or "Admin").strip()

    if not code:
        return jsonify({"success": False, "error": "4-digit security code is required."}), 400

    if code == ADMIN_SECURITY_CODE:
        return jsonify({
            "success": True,
            "verified": True,
            "role": "owner",
            "user": {
                "id": "USR-ADMIN-01",
                "name": username,
                "role": "owner"
            },
            "message": "Admin code authorized."
        }), 200
    else:
        return jsonify({
            "success": False,
            "verified": False,
            "error": "Invalid 4-digit security code. Access denied."
        }), 403


@app.route("/api/auth/register", methods=["POST"])
def auth_register():
    """
    POST /api/auth/register
    Creates a new customer account with securely hashed password in MySQL.
    """
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name") or "").strip()
    email = str(payload.get("email") or "").strip().lower()
    phone = str(payload.get("phone") or "").strip()
    password = str(payload.get("password") or "")

    if not name or not email or not phone or not password:
        return jsonify({"success": False, "error": "All fields are required."}), 400

    if len(password) < 6:
        return jsonify({"success": False, "error": "Password must be at least 6 characters."}), 400

    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("SELECT id FROM users WHERE email = %s LIMIT 1", (email,))
        if cursor.fetchone():
            return jsonify({"success": False, "error": "An account with that email already exists."}), 409

        user_id = f"USR-{int(time.time())}-{random.randint(100, 999)}"
        hashed = generate_password_hash(password)

        insert_sql = """
            INSERT INTO users (id, name, email, phone, password_hash, role)
            VALUES (%s, %s, %s, %s, %s, 'customer')
        """
        cursor.execute(insert_sql, (user_id, name, email, phone, hashed))
        conn.commit()

        return jsonify({
            "success": True,
            "message": "Account registered successfully.",
            "user": {
                "id": user_id,
                "name": name,
                "email": email,
                "role": "customer"
            }
        }), 201

    except Error as err:
        print(f"[!] MySQL Error in /api/auth/register: {err}")
        if conn:
            conn.rollback()
        return jsonify({"success": False, "error": "Database error", "details": str(err)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


# --------------------------------------------------------------------------
# Equipment Inventory Endpoints (Create, Read, Update, Delete)
# --------------------------------------------------------------------------

@app.route("/api/equipment", methods=["GET"])
def get_equipment():
    """
    GET /api/equipment
    Retrieves all equipment records directly from MySQL.
    """
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM equipment ORDER BY created_at DESC")
        rows = cursor.fetchall()
        return jsonify({"success": True, "count": len(rows), "data": rows}), 200
    except Error as err:
        print(f"[!] MySQL Error in GET /api/equipment: {err}")
        return jsonify({"success": False, "error": "Database query error", "details": str(err)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


@app.route("/api/equipment", methods=["POST"])
def create_equipment():
    """
    POST /api/equipment
    Adds a new equipment tracking record to MySQL and commits immediately.
    """
    payload = request.get_json(silent=True) or {}
    eq_id = str(payload.get("id") or f"EQ-{random.randint(100, 999)}").strip()
    name = str(payload.get("name") or "").strip()
    category = str(payload.get("category") or "Extractor").strip()
    serial_number = str(payload.get("serial_number") or payload.get("serial") or f"SN-{eq_id}").strip()
    location = str(payload.get("location") or "HQ Store").strip()
    status = normalize_equipment_status(payload.get("status"))
    condition = normalize_equipment_condition(payload.get("condition"))

    try:
        hourly_rate = float(payload.get("hourly_rate", payload.get("hourlyRate", 0.0)))
    except (ValueError, TypeError):
        hourly_rate = 0.0

    last_service_date = str(payload.get("last_service_date", payload.get("lastService", datetime.date.today().isoformat()))).strip()
    notes = str(payload.get("notes") or "").strip()

    if not name:
        return jsonify({"success": False, "error": "Equipment 'name' is required."}), 400

    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            INSERT INTO equipment (
                id, name, category, serial_number, location, status, `condition`, hourly_rate, last_service_date, notes
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (eq_id, name, category, serial_number, location, status, condition, hourly_rate, last_service_date, notes))
        conn.commit()

        return jsonify({
            "success": True,
            "message": "Equipment item created successfully in MySQL.",
            "data": {
                "id": eq_id,
                "name": name,
                "category": category,
                "serial_number": serial_number,
                "location": location,
                "status": status,
                "condition": condition,
                "hourly_rate": hourly_rate
            }
        }), 201

    except Error as err:
        print(f"[!] MySQL Error in POST /api/equipment: {err}")
        if conn:
            conn.rollback()
        return jsonify({"success": False, "error": "Database insert error", "details": str(err)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


@app.route("/api/equipment/<equipment_id>", methods=["GET", "PUT", "DELETE"])
def handle_single_equipment(equipment_id):
    """Handles GET, PUT, and DELETE for an individual equipment tracking item in MySQL."""
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        if request.method == "GET":
            cursor.execute("SELECT * FROM equipment WHERE id = %s LIMIT 1", (equipment_id,))
            row = cursor.fetchone()
            if not row:
                return jsonify({"success": False, "error": "Equipment item not found."}), 404
            return jsonify({"success": True, "data": row}), 200

        if request.method == "DELETE":
            cursor.execute("DELETE FROM equipment WHERE id = %s", (equipment_id,))
            conn.commit()
            return jsonify({"success": True, "message": f"Equipment {equipment_id} removed from MySQL."}), 200

        # PUT update
        payload = request.get_json(silent=True) or {}
        cursor.execute("SELECT * FROM equipment WHERE id = %s LIMIT 1", (equipment_id,))
        item = cursor.fetchone()
        if not item:
            return jsonify({"success": False, "error": "Equipment item not found."}), 404

        name = payload.get("name", item["name"])
        category = payload.get("category", item["category"])
        serial_number = payload.get("serial_number", payload.get("serial", item["serial_number"]))
        location = payload.get("location", item["location"])
        status = normalize_equipment_status(payload.get("status", item["status"]))
        condition = normalize_equipment_condition(payload.get("condition", item["condition"]))
        hourly_rate = float(payload.get("hourly_rate", payload.get("hourlyRate", item["hourly_rate"])))
        notes = payload.get("notes", item["notes"])

        cursor.execute("""
            UPDATE equipment
            SET name = %s, category = %s, serial_number = %s, location = %s,
                status = %s, `condition` = %s, hourly_rate = %s, notes = %s
            WHERE id = %s
        """, (name, category, serial_number, location, status, condition, hourly_rate, notes, equipment_id))
        conn.commit()

        return jsonify({"success": True, "message": "Equipment updated successfully in MySQL."}), 200

    except Error as err:
        print(f"[!] MySQL Error in /api/equipment/{equipment_id}: {err}")
        if conn:
            conn.rollback()
        return jsonify({"success": False, "error": "Database error", "details": str(err)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


# --------------------------------------------------------------------------
# Bookings Endpoints (Create, Read, Update, Delete)
# --------------------------------------------------------------------------

@app.route("/api/bookings", methods=["GET"])
def get_bookings():
    """
    GET /api/bookings
    Retrieves bookings from MySQL, optionally filtered by user_id or status.
    """
    user_id = request.args.get("user_id")
    status = request.args.get("status")

    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        query = "SELECT * FROM bookings WHERE 1=1"
        params = []

        if user_id:
            query += " AND user_id = %s"
            params.append(user_id)
        if status:
            query += " AND status = %s"
            params.append(status)

        query += " ORDER BY appointment_date DESC, created_at DESC"
        cursor.execute(query, tuple(params))
        bookings_list = cursor.fetchall()

        # Hydrate booking items for each booking
        for b in bookings_list:
            b_id = b["id"]
            cursor.execute("SELECT id, item_label, quantity, unit_price, total_price FROM booking_items WHERE booking_id = %s ORDER BY id ASC", (b_id,))
            b["items"] = cursor.fetchall()

            # Hydrate service-specific details
            st = (b.get("service_type") or "").lower()
            if st == "carpet":
                cursor.execute("SELECT area_sqm FROM booking_carpet_details WHERE booking_id = %s LIMIT 1", (b_id,))
                b["carpet_details"] = cursor.fetchone()
            elif st == "upholstery":
                cursor.execute("SELECT upholstery_type, quantity FROM booking_upholstery_details WHERE booking_id = %s LIMIT 1", (b_id,))
                b["upholstery_details"] = cursor.fetchone()
            elif st == "vehicle":
                cursor.execute("SELECT vehicle_type, registration_number, seats, fleet_count FROM booking_vehicle_details WHERE booking_id = %s LIMIT 1", (b_id,))
                b["vehicle_details"] = cursor.fetchone()

        return jsonify({"success": True, "count": len(bookings_list), "data": bookings_list}), 200

    except Error as err:
        print(f"[!] MySQL Error in GET /api/bookings: {err}")
        return jsonify({"success": False, "error": "Database error", "details": str(err)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


@app.route("/api/bookings", methods=["POST"])
def create_booking():
    """
    POST /api/bookings
    Creates a new booking record, its service-specific details, booking items,
    initial rental record (if applicable), and deposit payment record in MySQL.
    """
    payload = request.get_json(silent=True) or {}
    if not payload:
        return jsonify({"success": False, "error": "JSON payload required."}), 400

    booking_id = str(payload.get("id") or "").strip() or f"CR-{int(time.time()*1000)}-{random.randint(100, 999)}"
    raw_user_id = str(payload.get("user_id") or payload.get("userId") or "").strip()
    customer_name = str(payload.get("customer_name") or payload.get("name") or "Valued Customer").strip()
    customer_email = str(payload.get("customer_email") or payload.get("email") or "customer@cleanride.local").strip().lower()
    customer_phone = str(payload.get("customer_phone") or payload.get("phone") or "012-0000000").strip()
    address = str(payload.get("address") or "Service Address").strip()
    appointment_date = str(payload.get("appointment_date") or payload.get("date") or datetime.date.today().isoformat()).strip()
    arrival_window = str(payload.get("arrival_window") or payload.get("time") or "09:00").strip()
    service_type = str(payload.get("service_type") or payload.get("service") or "upholstery").strip().lower()
    dirtiness = str(payload.get("dirtiness") or "Moderate").strip()
    instructions = str(payload.get("instructions") or "").strip()

    try:
        base_price = float(payload.get("base_price", payload.get("base", 0.0)))
        surcharge = float(payload.get("surcharge", 0.0))
        total_amount = float(payload.get("total_amount", payload.get("total", base_price + surcharge)))
        deposit_amount = float(payload.get("deposit_amount", payload.get("deposit", round(total_amount * 0.2, 2))))
        paid_amount = float(payload.get("paid_amount", payload.get("paid", deposit_amount)))
        balance_amount = float(payload.get("balance_amount", payload.get("balance", round(total_amount - paid_amount, 2))))
    except (ValueError, TypeError) as e:
        return jsonify({"success": False, "error": f"Invalid numeric amount in payload: {e}"}), 400

    status = str(payload.get("status") or "Pending").strip()
    payment_status = str(payload.get("payment_status") or payload.get("paymentStatus") or ("Deposit paid" if paid_amount > 0 else "Unpaid")).strip()

    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # 1. Foreign Key Verification: Ensure user exists in users table
        confirmed_user_id = ensure_user_exists(cursor, raw_user_id, customer_name, customer_email, customer_phone)

        # 2. Insert into `bookings` table
        insert_booking_sql = """
            INSERT INTO bookings (
                id, user_id, customer_name, customer_email, customer_phone,
                address, appointment_date, arrival_window, service_type,
                dirtiness, instructions, base_price, surcharge, total_amount,
                deposit_amount, paid_amount, balance_amount, status, payment_status
            ) VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s
            )
        """
        cursor.execute(insert_booking_sql, (
            booking_id, confirmed_user_id, customer_name, customer_email, customer_phone,
            address, appointment_date, arrival_window, service_type,
            dirtiness, instructions, base_price, surcharge, total_amount,
            deposit_amount, paid_amount, balance_amount, status, payment_status
        ))

        # 3. Insert Service-Specific Details
        if service_type == "carpet":
            area = float(payload.get("area_sqm", payload.get("area", 30.0)))
            cursor.execute("""
                INSERT INTO booking_carpet_details (booking_id, area_sqm)
                VALUES (%s, %s)
            """, (booking_id, area))

        elif service_type == "upholstery":
            u_type = str(payload.get("upholstery_type", payload.get("upholsteryType", "sofa"))).strip()
            qty = int(payload.get("quantity", 1))
            cursor.execute("""
                INSERT INTO booking_upholstery_details (booking_id, upholstery_type, quantity)
                VALUES (%s, %s, %s)
            """, (booking_id, u_type, qty))

        elif service_type == "vehicle":
            v_type = str(payload.get("vehicle_type", payload.get("vehicleType", "car"))).strip()
            reg_num = str(payload.get("registration_number", payload.get("registration", "N/A"))).strip()
            seats = int(payload.get("seats", 5))
            fleet = int(payload.get("fleet_count", payload.get("fleet", 1)))
            cursor.execute("""
                INSERT INTO booking_vehicle_details (booking_id, vehicle_type, registration_number, seats, fleet_count)
                VALUES (%s, %s, %s, %s, %s)
            """, (booking_id, v_type, reg_num, seats, fleet))

        # 4. Insert booking items into `booking_items`
        items = payload.get("items") or []
        if isinstance(items, list) and items:
            insert_item_sql = """
                INSERT INTO booking_items (booking_id, item_label, quantity, unit_price, total_price)
                VALUES (%s, %s, %s, %s, %s)
            """
            for item in items:
                label = str(item.get("label", item.get("item_label", "Cleaning Service"))).strip()
                qty = float(item.get("qty", item.get("quantity", 1)))
                u_price = float(item.get("unit", item.get("unit_price", total_amount)))
                t_price = float(item.get("total_price", round(qty * u_price, 2)))
                cursor.execute(insert_item_sql, (booking_id, label, qty, u_price, t_price))
        else:
            cursor.execute("""
                INSERT INTO booking_items (booking_id, item_label, quantity, unit_price, total_price)
                VALUES (%s, %s, %s, %s, %s)
            """, (booking_id, f"{service_type.capitalize()} Service", 1.0, total_amount, total_amount))

        # 5. If service is rental, insert into `rentals` table
        if service_type == "rental":
            rental_id = str(payload.get("rental_id") or f"RN-{int(time.time()*1000)}-{random.randint(100, 999)}")
            equip_type = str(payload.get("equipment_type", payload.get("equipment", "extractor"))).strip()
            rental_start = str(payload.get("rental_start_date", payload.get("rentalStart", appointment_date))).strip()
            rental_hours = int(payload.get("rental_hours", payload.get("rentalHours", 4)))

            cursor.execute("""
                INSERT INTO rentals (
                    id, booking_id, user_id, equipment_type, rental_start_date, rental_hours, total_price, status
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, 'Requested')
            """, (rental_id, booking_id, confirmed_user_id, equip_type, rental_start, rental_hours, total_amount))

        # 6. Record deposit payment if paid > 0
        if paid_amount > 0:
            payment_id = str(payload.get("payment_id") or f"PAY-{int(time.time()*1000)}-{random.randint(100, 999)}")
            p_method = str(payload.get("payment_method") or payload.get("method") or "Online transfer (simulated)").strip()
            p_date = appointment_date
            p_note = "Booking deposit (simulated)"

            cursor.execute("""
                INSERT INTO payments (id, booking_id, amount, payment_date, payment_method, payment_note)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (payment_id, booking_id, paid_amount, p_date, p_method, p_note))

        conn.commit()

        return jsonify({
            "success": True,
            "message": "Booking successfully created and saved to MySQL.",
            "data": {
                "id": booking_id,
                "user_id": confirmed_user_id,
                "customer_name": customer_name,
                "appointment_date": appointment_date,
                "arrival_window": arrival_window,
                "service_type": service_type,
                "total_amount": total_amount,
                "paid_amount": paid_amount,
                "balance_amount": balance_amount,
                "status": status,
                "payment_status": payment_status
            }
        }), 201

    except Error as err:
        print(f"[!] MySQL Error in POST /api/bookings: {err}")
        if conn:
            conn.rollback()
        return jsonify({"success": False, "error": "Database insert error", "details": str(err)}), 500
    except Exception as ex:
        print(f"[!] Server Error in POST /api/bookings: {ex}")
        if conn:
            conn.rollback()
        return jsonify({"success": False, "error": "Internal server error", "details": str(ex)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


@app.route("/api/bookings/<booking_id>", methods=["GET", "PUT", "DELETE"])
def handle_single_booking(booking_id):
    """Handles GET, PUT, and DELETE operations for a specific booking."""
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        if request.method == "GET":
            cursor.execute("SELECT * FROM bookings WHERE id = %s LIMIT 1", (booking_id,))
            booking = cursor.fetchone()
            if not booking:
                return jsonify({"success": False, "error": "Booking not found."}), 404

            cursor.execute("SELECT id, item_label, quantity, unit_price, total_price FROM booking_items WHERE booking_id = %s", (booking_id,))
            booking["items"] = cursor.fetchall()
            return jsonify({"success": True, "data": booking}), 200

        if request.method == "DELETE":
            cursor.execute("DELETE FROM bookings WHERE id = %s", (booking_id,))
            conn.commit()
            return jsonify({"success": True, "message": f"Booking {booking_id} deleted."}), 200

        # PUT booking update
        payload = request.get_json(silent=True) or {}
        cursor.execute("SELECT * FROM bookings WHERE id = %s LIMIT 1", (booking_id,))
        current = cursor.fetchone()
        if not current:
            return jsonify({"success": False, "error": "Booking not found."}), 404

        status = payload.get("status", current["status"])
        appointment_date = payload.get("appointment_date", current["appointment_date"])
        arrival_window = payload.get("arrival_window", current["arrival_window"])
        reschedule_date = payload.get("reschedule_date")
        reschedule_time = payload.get("reschedule_time")

        current_paid = float(current["paid_amount"] or 0.0)
        current_total = float(current["total_amount"] or 0.0)
        payment_amount = float(payload.get("payment_amount", payload.get("payment", 0.0)))

        new_paid = current_paid + payment_amount
        new_balance = max(0.0, round(current_total - new_paid, 2))
        payment_status = "Paid" if new_balance <= 0 else ("Part-paid" if new_paid > 0 else "Unpaid")

        # If payment recorded, insert into payments table
        if payment_amount > 0:
            payment_id = f"PAY-{int(time.time()*1000)}-{random.randint(100, 999)}"
            p_method = str(payload.get("payment_method", payload.get("method", "Cash"))).strip()
            p_note = str(payload.get("payment_note", payload.get("paymentNote", "Balance settlement"))).strip()
            cursor.execute("""
                INSERT INTO payments (id, booking_id, amount, payment_date, payment_method, payment_note)
                VALUES (%s, %s, %s, CURDATE(), %s, %s)
            """, (payment_id, booking_id, payment_amount, p_method, p_note))

        # Update booking record
        if reschedule_date and reschedule_time:
            update_sql = """
                UPDATE bookings
                SET status = %s, appointment_date = %s, arrival_window = %s,
                    reschedule_date = %s, reschedule_time = %s, reschedule_requested_at = NOW(),
                    paid_amount = %s, balance_amount = %s, payment_status = %s
                WHERE id = %s
            """
            cursor.execute(update_sql, (
                status, appointment_date, arrival_window,
                reschedule_date, reschedule_time,
                new_paid, new_balance, payment_status, booking_id
            ))
        else:
            update_sql = """
                UPDATE bookings
                SET status = %s, appointment_date = %s, arrival_window = %s,
                    paid_amount = %s, balance_amount = %s, payment_status = %s
                WHERE id = %s
            """
            cursor.execute(update_sql, (
                status, appointment_date, arrival_window,
                new_paid, new_balance, payment_status, booking_id
            ))

        conn.commit()

        return jsonify({
            "success": True,
            "message": f"Booking {booking_id} updated successfully.",
            "data": {
                "id": booking_id,
                "status": status,
                "appointment_date": appointment_date,
                "paid_amount": new_paid,
                "balance_amount": new_balance,
                "payment_status": payment_status
            }
        }), 200

    except Error as err:
        print(f"[!] MySQL Error in /api/bookings/{booking_id}: {err}")
        if conn:
            conn.rollback()
        return jsonify({"success": False, "error": "Database error", "details": str(err)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


# --------------------------------------------------------------------------
# Complaints / Feedback Endpoints (Create, Read, Update, Delete)
# --------------------------------------------------------------------------

@app.route("/api/complaints", methods=["GET"])
def get_complaints():
    """GET /api/complaints - Retrieves complaints directly from MySQL."""
    user_id = request.args.get("user_id")

    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        if user_id:
            cursor.execute("SELECT * FROM complaints WHERE user_id = %s ORDER BY created_at DESC", (user_id,))
        else:
            cursor.execute("SELECT * FROM complaints ORDER BY created_at DESC")

        rows = cursor.fetchall()
        return jsonify({"success": True, "count": len(rows), "data": rows}), 200

    except Error as err:
        print(f"[!] MySQL Error in GET /api/complaints: {err}")
        return jsonify({"success": False, "error": "Database error", "details": str(err)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


@app.route("/api/complaints", methods=["POST"])
def create_complaint():
    """POST /api/complaints - Lodges customer feedback/complaint in MySQL."""
    payload = request.get_json(silent=True) or {}
    if not payload:
        return jsonify({"success": False, "error": "JSON payload required."}), 400

    complaint_id = str(payload.get("id") or f"CC-{random.randint(1000, 9999)}").strip()
    booking_id = str(payload.get("booking_id") or payload.get("bookingId") or "").strip()
    raw_user_id = str(payload.get("user_id") or payload.get("userId") or "").strip()
    category = str(payload.get("category") or "Service quality").strip()
    subject = str(payload.get("subject") or "").strip()
    description = str(payload.get("description") or "").strip()
    incident_date = str(payload.get("incident_date") or payload.get("date") or datetime.date.today().isoformat()).strip()
    status = str(payload.get("status") or "In review").strip()

    if not booking_id or not subject or not description:
        return jsonify({"success": False, "error": "'booking_id', 'subject', and 'description' are required."}), 400

    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Ensure booking exists for FK integrity
        cursor.execute("SELECT id, user_id FROM bookings WHERE id = %s LIMIT 1", (booking_id,))
        booking_row = cursor.fetchone()

        if not booking_row:
            confirmed_user_id = ensure_user_exists(cursor, raw_user_id)
            cursor.execute("""
                INSERT INTO bookings (
                    id, user_id, customer_name, customer_email, customer_phone,
                    address, appointment_date, arrival_window, service_type,
                    dirtiness, total_amount, balance_amount, status, payment_status
                ) VALUES (
                    %s, %s, 'Customer', 'feedback@cleanride.local', '012-0000000',
                    'Service Location', CURDATE(), '09:00', 'upholstery',
                    'Moderate', 0.00, 0.00, 'Completed', 'Paid'
                )
            """, (booking_id, confirmed_user_id))
        else:
            confirmed_user_id = booking_row["user_id"] or ensure_user_exists(cursor, raw_user_id)

        insert_complaint_sql = """
            INSERT INTO complaints (id, booking_id, user_id, category, subject, description, status, incident_date)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """
        cursor.execute(insert_complaint_sql, (
            complaint_id, booking_id, confirmed_user_id, category, subject, description, status, incident_date
        ))
        conn.commit()

        return jsonify({
            "success": True,
            "message": "Feedback lodged successfully and saved to MySQL.",
            "data": {
                "id": complaint_id,
                "booking_id": booking_id,
                "user_id": confirmed_user_id,
                "category": category,
                "subject": subject,
                "status": status,
                "incident_date": incident_date
            }
        }), 201

    except Error as err:
        print(f"[!] MySQL Error in POST /api/complaints: {err}")
        if conn:
            conn.rollback()
        return jsonify({"success": False, "error": "Database insert error", "details": str(err)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


@app.route("/api/complaints/<complaint_id>", methods=["PUT", "DELETE"])
def handle_single_complaint(complaint_id):
    """PUT / DELETE for a single complaint item."""
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        if request.method == "DELETE":
            cursor.execute("DELETE FROM complaints WHERE id = %s", (complaint_id,))
            conn.commit()
            return jsonify({"success": True, "message": f"Complaint {complaint_id} deleted."}), 200

        # PUT
        payload = request.get_json(silent=True) or {}
        team_response = payload.get("team_response", payload.get("response"))
        status = payload.get("status")

        cursor.execute("SELECT * FROM complaints WHERE id = %s LIMIT 1", (complaint_id,))
        complaint = cursor.fetchone()
        if not complaint:
            return jsonify({"success": False, "error": "Complaint not found."}), 404

        new_status = status if status is not None else complaint["status"]
        new_response = team_response if team_response is not None else complaint["team_response"]

        cursor.execute("""
            UPDATE complaints
            SET status = %s, team_response = %s
            WHERE id = %s
        """, (new_status, new_response, complaint_id))
        conn.commit()

        return jsonify({
            "success": True,
            "message": "Complaint updated successfully in MySQL.",
            "data": {
                "id": complaint_id,
                "status": new_status,
                "team_response": new_response
            }
        }), 200

    except Error as err:
        print(f"[!] MySQL Error in /api/complaints/{complaint_id}: {err}")
        if conn:
            conn.rollback()
        return jsonify({"success": False, "error": "Database update error", "details": str(err)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


# --------------------------------------------------------------------------
# Payments Endpoints
# --------------------------------------------------------------------------

@app.route("/api/payments", methods=["GET", "POST"])
def handle_payments():
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        if request.method == "GET":
            booking_id = request.args.get("booking_id")
            if booking_id:
                cursor.execute("SELECT * FROM payments WHERE booking_id = %s ORDER BY payment_date DESC, created_at DESC", (booking_id,))
            else:
                cursor.execute("SELECT * FROM payments ORDER BY payment_date DESC, created_at DESC")
            rows = cursor.fetchall()
            return jsonify({"success": True, "count": len(rows), "data": rows}), 200

        # POST
        payload = request.get_json(silent=True) or {}
        payment_id = str(payload.get("id") or f"PAY-{int(time.time()*1000)}-{random.randint(100, 999)}").strip()
        booking_id = str(payload.get("booking_id") or payload.get("bookingId") or "").strip()
        amount = float(payload.get("amount") or 0.0)
        payment_date = str(payload.get("payment_date") or payload.get("date") or datetime.date.today().isoformat()).strip()
        payment_method = str(payload.get("payment_method") or payload.get("method") or "Cash").strip()
        payment_note = str(payload.get("payment_note") or payload.get("note") or "Payment recorded").strip()

        if not booking_id or amount <= 0:
            return jsonify({"success": False, "error": "Valid 'booking_id' and 'amount' > 0 are required."}), 400

        cursor.execute("""
            INSERT INTO payments (id, booking_id, amount, payment_date, payment_method, payment_note)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (payment_id, booking_id, amount, payment_date, payment_method, payment_note))

        cursor.execute("SELECT total_amount, paid_amount FROM bookings WHERE id = %s LIMIT 1", (booking_id,))
        booking = cursor.fetchone()
        if booking:
            new_paid = float(booking["paid_amount"] or 0.0) + amount
            new_bal = max(0.0, round(float(booking["total_amount"] or 0.0) - new_paid, 2))
            p_status = "Paid" if new_bal <= 0 else "Part-paid"
            cursor.execute("""
                UPDATE bookings SET paid_amount = %s, balance_amount = %s, payment_status = %s WHERE id = %s
            """, (new_paid, new_bal, p_status, booking_id))

        conn.commit()
        return jsonify({
            "success": True,
            "message": "Payment recorded successfully in MySQL.",
            "data": {
                "id": payment_id,
                "booking_id": booking_id,
                "amount": amount,
                "payment_date": payment_date,
                "payment_method": payment_method
            }
        }), 201

    except Error as err:
        print(f"[!] MySQL Error in /api/payments: {err}")
        if conn:
            conn.rollback()
        return jsonify({"success": False, "error": "Database error", "details": str(err)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


# --------------------------------------------------------------------------
# Tool Rentals Endpoints
# --------------------------------------------------------------------------

@app.route("/api/rentals", methods=["GET"])
def get_rentals():
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM rentals ORDER BY rental_start_date DESC, created_at DESC")
        rows = cursor.fetchall()
        return jsonify({"success": True, "count": len(rows), "data": rows}), 200
    except Error as err:
        print(f"[!] MySQL Error in GET /api/rentals: {err}")
        return jsonify({"success": False, "error": "Database error", "details": str(err)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


@app.route("/api/rentals/<rental_id>", methods=["PUT"])
def update_rental(rental_id):
    payload = request.get_json(silent=True) or {}
    new_status = payload.get("status")

    if not new_status:
        return jsonify({"success": False, "error": "Status is required."}), 400

    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("UPDATE rentals SET status = %s WHERE id = %s", (new_status, rental_id))
        conn.commit()

        return jsonify({"success": True, "message": f"Rental {rental_id} status updated to {new_status}."}), 200

    except Error as err:
        print(f"[!] MySQL Error in PUT /api/rentals/{rental_id}: {err}")
        if conn:
            conn.rollback()
        return jsonify({"success": False, "error": "Database update error", "details": str(err)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


# --------------------------------------------------------------------------
# System Settings (Pricing & Capacity) Endpoints
# --------------------------------------------------------------------------

@app.route("/api/settings", methods=["GET", "PUT"])
def handle_settings():
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        if request.method == "GET":
            cursor.execute("SELECT setting_key, setting_value, description FROM system_settings")
            rows = cursor.fetchall()
            settings_dict = {r["setting_key"]: r["setting_value"] for r in rows}
            return jsonify({"success": True, "data": settings_dict}), 200

        # PUT
        payload = request.get_json(silent=True) or {}
        import json
        for k, v in payload.items():
            val_str = json.dumps(v) if isinstance(v, (dict, list)) else str(v)
            cursor.execute("""
                INSERT INTO system_settings (setting_key, setting_value)
                VALUES (%s, %s)
                ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
            """, (k, val_str))

        conn.commit()
        return jsonify({"success": True, "message": "System settings saved successfully in MySQL."}), 200

    except Error as err:
        print(f"[!] MySQL Error in /api/settings: {err}")
        if conn:
            conn.rollback()
        return jsonify({"success": False, "error": "Database error", "details": str(err)}), 500
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


# --------------------------------------------------------------------------
# Items Endpoints
# --------------------------------------------------------------------------

@app.route("/api/items", methods=["GET"])
def get_items():
    booking_id = request.args.get("booking_id")
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        if booking_id:
            query = """
                SELECT id, booking_id, item_label, quantity, unit_price, total_price 
                FROM booking_items 
                WHERE booking_id = %s 
                ORDER BY id ASC
            """
            cursor.execute(query, (booking_id,))
        else:
            query = """
                SELECT id, booking_id, item_label, quantity, unit_price, total_price 
                FROM booking_items 
                ORDER BY id DESC
            """
            cursor.execute(query)

        rows = cursor.fetchall()
        return jsonify({"success": True, "count": len(rows), "data": rows}), 200

    except Error as err:
        print(f"[!] MySQL Error in GET /api/items: {err}")
        return jsonify({"success": False, "error": "Database query error", "details": str(err)}), 500

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


@app.route("/api/items", methods=["POST"])
def create_item():
    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"success": False, "error": "Invalid request. JSON payload is required."}), 400

    booking_id = str(payload.get("booking_id") or "").strip()
    item_label = str(payload.get("item_label") or "").strip()
    quantity = payload.get("quantity")
    unit_price = payload.get("unit_price")

    if not booking_id or not item_label or quantity is None or unit_price is None:
        return jsonify({
            "success": False,
            "error": "Missing required fields: 'booking_id', 'item_label', 'quantity', 'unit_price'."
        }), 400

    try:
        qty = float(quantity)
        u_price = float(unit_price)
        t_price = float(payload.get("total_price", round(qty * u_price, 2)))
    except (ValueError, TypeError):
        return jsonify({"success": False, "error": "'quantity', 'unit_price', and 'total_price' must be numbers."}), 400

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        # 1. Foreign Key Verification: Check if booking_id exists in `bookings`
        cursor.execute("SELECT id FROM bookings WHERE id = %s LIMIT 1", (booking_id,))
        existing_booking = cursor.fetchone()

        # If booking doesn't exist, create a parent booking record so foreign key constraint succeeds
        if not existing_booking:
            cursor.execute("SELECT id FROM users LIMIT 1")
            first_user = cursor.fetchone()
            user_id = first_user["id"] if first_user else "USR-ADMIN-01"

            booking_insert_sql = """
                INSERT INTO bookings (
                    id, user_id, customer_name, customer_email, customer_phone,
                    address, appointment_date, arrival_window, service_type,
                    dirtiness, total_amount, balance_amount, status, payment_status
                ) VALUES (
                    %s, %s, 'Sample Customer', 'customer@example.com', '012-3456789',
                    'Default Service Address', CURDATE(), '09:00', 'upholstery',
                    'Moderate', %s, %s, 'Pending', 'Unpaid'
                )
            """
            cursor.execute(booking_insert_sql, (booking_id, user_id, t_price, t_price))

        # 2. Insert item into `booking_items`
        insert_query = """
            INSERT INTO booking_items (booking_id, item_label, quantity, unit_price, total_price)
            VALUES (%s, %s, %s, %s, %s)
        """
        params = (booking_id, item_label, qty, u_price, t_price)
        cursor.execute(insert_query, params)
        connection.commit()

        new_id = cursor.lastrowid

        return jsonify({
            "success": True,
            "message": "Item successfully created in MySQL.",
            "data": {
                "id": new_id,
                "booking_id": booking_id,
                "item_label": item_label,
                "quantity": qty,
                "unit_price": u_price,
                "total_price": t_price
            }
        }), 201

    except Error as err:
        print(f"[!] MySQL Error in POST /api/items: {err}")
        if connection:
            connection.rollback()
        return jsonify({"success": False, "error": "Database insert error", "details": str(err)}), 500

    finally:
        if cursor:
            cursor.close()
        if connection and connection.is_connected():
            connection.close()


# --------------------------------------------------------------------------
# Frontend Serving Routes
# --------------------------------------------------------------------------

@app.route("/")
def serve_index():
    return send_from_directory(".", "index.html")


@app.route("/<path:filename>")
def serve_static_files(filename):
    return send_from_directory(".", filename)


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "True").lower() in ("true", "1", "t")
    print(f"[*] Starting CleanRide Flask server at http://127.0.0.1:{port}")
    app.run(host="0.0.0.0", port=port, debug=debug)
