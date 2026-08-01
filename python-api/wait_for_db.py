"""Wait for the test database to accept connections before running tests."""
import os
import sys
import time

import psycopg2

url = os.environ.get("TEST_DATABASE_URL", "")
if not url:
    print("TEST_DATABASE_URL not set, skipping wait")
    sys.exit(0)

max_retries = 30
for i in range(max_retries):
    try:
        conn = psycopg2.connect(url)
        conn.close()
        print(f"Database ready after {i + 1} attempt(s)")
        sys.exit(0)
    except psycopg2.OperationalError:
        if i < max_retries - 1:
            time.sleep(1)

print(f"Could not connect to database after {max_retries} attempts")
sys.exit(1)
