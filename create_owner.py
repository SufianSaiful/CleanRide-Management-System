import os
import mysql.connector
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash

# 1. Load database credentials from .env using absolute path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "cleanridedb")
DB_PORT = int(os.getenv("DB_PORT", 3307))

USERNAME = "adminCleanRide"
RAW_PASSWORD = "admincleanride1244"


def get_connection():
    """Connects to MySQL, testing primary port and alternative port (3307 / 3306) if needed."""
    ports_to_try = [DB_PORT]
    if 3306 not in ports_to_try:
        ports_to_try.append(3306)
    if 3307 not in ports_to_try:
        ports_to_try.append(3307)

    dbs_to_try = [DB_NAME]
    for alt_db in ["cleanridedb", "cleanride_db"]:
        if alt_db not in dbs_to_try:
            dbs_to_try.append(alt_db)

    last_error = None
    for port in ports_to_try:
        for db in dbs_to_try:
            try:
                conn = mysql.connector.connect(
                    host=DB_HOST,
                    user=DB_USER,
                    password=DB_PASSWORD,
                    database=db,
                    port=port
                )
                if conn.is_connected():
                    print(f"[*] Connected to MySQL on port {port}, database '{db}'")
                    return conn
            except mysql.connector.Error as err:
                last_error = err
                continue

    raise last_error


def create_owner_account():
    print(f"[*] Initializing owner account setup for '{USERNAME}'...")
    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor()

        # 1. Ensure `owners` table exists
        create_table_sql = """
            CREATE TABLE IF NOT EXISTS `owners` (
                `id` INT(11) NOT NULL AUTO_INCREMENT,
                `username` VARCHAR(100) NOT NULL UNIQUE,
                `password_hash` VARCHAR(255) NOT NULL,
                `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
        """
        cursor.execute(create_table_sql)

        # 2. Hash password securely
        hashed_password = generate_password_hash(RAW_PASSWORD)

        # 3. Insert or update the owner account in `owners`
        insert_owner_sql = """
            INSERT INTO `owners` (`username`, `password_hash`)
            VALUES (%s, %s)
            ON DUPLICATE KEY UPDATE `password_hash` = VALUES(`password_hash`);
        """
        cursor.execute(insert_owner_sql, (USERNAME, hashed_password))

        # 4. Sync with `users` table
        try:
            insert_user_sql = """
                INSERT INTO `users` (`id`, `name`, `email`, `phone`, `password_hash`, `role`)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE 
                    `password_hash` = VALUES(`password_hash`),
                    `role` = 'owner';
            """
            cursor.execute(insert_user_sql, (
                "USR-ADMIN-01",
                "CleanRide Administrator",
                "adminCleanRide",
                "012-3456789",
                hashed_password,
                "owner"
            ))
        except mysql.connector.Error:
            pass

        conn.commit()

        print("\n" + "=" * 52)
        print("[+] SUCCESS: Owner account is configured and ready!")
        print(f"    - Username: {USERNAME}")
        print(f"    - Password: {RAW_PASSWORD}")
        print("    - 4-Digit Security Code: 2006")
        print("=" * 52 + "\n")

    except mysql.connector.Error as err:
        print(f"[!] Database Error: {err}")
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


if __name__ == "__main__":
    create_owner_account()
