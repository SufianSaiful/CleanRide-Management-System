import os
import time
import random
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

# 2. Custom JSON provider to serialize Decimal and Date types from MySQL
class CustomJSONProvider(DefaultJSONProvider):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
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
                # Verify by checking connection
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
            # Check or create default user for reference
            cursor.execute("SELECT id FROM users LIMIT 1")
            first_user = cursor.fetchone()
            user_id = first_user["id"] if first_user else "USR-ADMIN-01"

            # Insert parent booking
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
            "message": "Item successfully created.",
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
