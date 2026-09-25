from pathlib import Path
from sqlalchemy import text
from app.config import get_settings
from app.database.connection import get_engine

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS departments (
    department_id INTEGER PRIMARY KEY,
    department_name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
    employee_id INTEGER PRIMARY KEY,
    employee_name VARCHAR(100) NOT NULL,
    department_id INTEGER,
    hire_date DATE,
    FOREIGN KEY(department_id) REFERENCES departments(department_id)
);

CREATE TABLE IF NOT EXISTS customers (
    customer_id INTEGER PRIMARY KEY,
    customer_name VARCHAR(100) NOT NULL,
    email VARCHAR(150),
    country VARCHAR(80),
    created_at DATE
);

CREATE TABLE IF NOT EXISTS products (
    product_id INTEGER PRIMARY KEY,
    product_name VARCHAR(150) NOT NULL,
    category VARCHAR(80),
    price DECIMAL(12,2)
);

CREATE TABLE IF NOT EXISTS orders (
    order_id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    order_date DATE NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    FOREIGN KEY(customer_id) REFERENCES customers(customer_id)
);

CREATE TABLE IF NOT EXISTS order_items (
    order_item_id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(order_id),
    FOREIGN KEY(product_id) REFERENCES products(product_id)
);
"""

INSERT_SQL = """
INSERT INTO departments VALUES
(1,'Engineering'),(2,'Sales'),(3,'HR');

INSERT INTO employees VALUES
(1,'Aarav',1,'2022-01-10'),
(2,'Diya',2,'2023-05-12'),
(3,'Kabir',3,'2021-08-20');

INSERT INTO customers VALUES
(1,'Rahul','rahul@example.com','India','2024-01-15'),
(2,'Amit','amit@example.com','India','2024-02-10'),
(3,'Priya','priya@example.com','India','2024-03-05'),
(4,'Emma','emma@example.com','USA','2024-04-18'),
(5,'Noah','noah@example.com','USA','2024-05-01'),
(6,'Liam','liam@example.com','UK','2024-06-11'),
(7,'Olivia','olivia@example.com','UK','2024-07-09'),
(8,'Chen','chen@example.com','Singapore','2024-08-03');

INSERT INTO products VALUES
(1,'Laptop Pro','Electronics',1200.00),
(2,'Phone X','Electronics',800.00),
(3,'Monitor 4K','Electronics',500.00),
(4,'Office Chair','Furniture',300.00),
(5,'Desk','Furniture',450.00),
(6,'Keyboard','Accessories',100.00);

INSERT INTO orders VALUES
(1,1,'2025-01-05',2400.00),
(2,2,'2025-01-10',800.00),
(3,3,'2025-01-15',950.00),
(4,4,'2025-02-02',1200.00),
(5,1,'2025-02-15',500.00),
(6,5,'2025-02-20',1350.00),
(7,6,'2025-03-01',900.00),
(8,7,'2025-03-05',450.00),
(9,8,'2025-03-10',1600.00),
(10,2,'2025-03-15',1300.00);

INSERT INTO order_items VALUES
(1,1,1,2,1200),(2,2,2,1,800),(3,3,3,1,500),(4,3,6,2,100),
(5,4,1,1,1200),(6,5,3,1,500),(7,6,1,1,1200),(8,6,4,1,150),
(9,7,2,1,800),(10,7,6,1,100),(11,8,5,1,450),(12,9,1,1,1200),
(13,9,6,4,100),(14,10,3,2,500),(15,10,6,3,100);
"""


def seed():
    s = get_settings()
    if s.database_url.startswith("sqlite"):
        Path("../database").mkdir(exist_ok=True)

    engine = get_engine()
    with engine.begin() as conn:
        for statement in SCHEMA_SQL.split(";"):
            if statement.strip():
                conn.execute(text(statement))
        # Seed only if customers is empty.
        count = conn.execute(text("SELECT COUNT(*) FROM customers")).scalar_one()
        if count == 0:
            for statement in INSERT_SQL.split(";"):
                if statement.strip():
                    conn.execute(text(statement))
    print("Database ready.")


if __name__ == "__main__":
    seed()
