import sqlite3
import json
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'banker.db')

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS operations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            op_type TEXT NOT NULL,
            description TEXT NOT NULL,
            available_snapshot TEXT NOT NULL,
            allocation_snapshot TEXT NOT NULL,
            max_snapshot TEXT NOT NULL,
            need_snapshot TEXT NOT NULL,
            safe_seq TEXT,
            is_deadlock INTEGER DEFAULT 0,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

def clear_operations():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('DELETE FROM operations')
    cursor.execute('DELETE FROM sqlite_sequence WHERE name="operations"')
    conn.commit()
    conn.close()

def insert_operation(op_type, description, available, allocation, max_matrix, need, safe_seq=None, is_deadlock=0):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO operations (op_type, description, available_snapshot, allocation_snapshot, 
                                max_snapshot, need_snapshot, safe_seq, is_deadlock)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        op_type,
        description,
        json.dumps(available),
        json.dumps(allocation),
        json.dumps(max_matrix),
        json.dumps(need),
        json.dumps(safe_seq) if safe_seq else None,
        is_deadlock
    ))
    conn.commit()
    conn.close()

def get_latest_operation():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM operations ORDER BY id DESC LIMIT 1')
    row = cursor.fetchone()
    conn.close()
    if row:
        return {
            'id': row[0],
            'op_type': row[1],
            'description': row[2],
            'available': json.loads(row[3]),
            'allocation': json.loads(row[4]),
            'max': json.loads(row[5]),
            'need': json.loads(row[6]),
            'safe_seq': json.loads(row[7]) if row[7] else None,
            'is_deadlock': row[8],
            'timestamp': row[9]
        }
    return None

def get_all_operations():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM operations ORDER BY id')
    rows = cursor.fetchall()
    conn.close()
    operations = []
    for row in rows:
        operations.append({
            'id': row[0],
            'op_type': row[1],
            'description': row[2],
            'available': json.loads(row[3]),
            'allocation': json.loads(row[4]),
            'max': json.loads(row[5]),
            'need': json.loads(row[6]),
            'safe_seq': json.loads(row[7]) if row[7] else None,
            'is_deadlock': row[8],
            'timestamp': row[9]
        })
    return operations

def get_operation_by_id(op_id):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM operations WHERE id = ?', (op_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return {
            'id': row[0],
            'op_type': row[1],
            'description': row[2],
            'available': json.loads(row[3]),
            'allocation': json.loads(row[4]),
            'max': json.loads(row[5]),
            'need': json.loads(row[6]),
            'safe_seq': json.loads(row[7]) if row[7] else None,
            'is_deadlock': row[8],
            'timestamp': row[9]
        }
    return None

if __name__ == '__main__':
    init_db()