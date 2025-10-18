import sqlite3
import json
from flask import Flask, jsonify, request, send_from_directory

app = Flask(__name__, static_folder='static')

# --- УПРАВЛЕНИЕ БАЗОЙ ДАННЫХ (для оценок) ---
DB_NAME = 'ratings.db'

def init_db():
    """Создает таблицу в базе данных, если она еще не существует."""
    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS ratings (
                abnormality_id TEXT NOT NULL,
                user_identifier TEXT NOT NULL,
                rating INTEGER NOT NULL,
                PRIMARY KEY (abnormality_id, user_identifier)
            )
        ''')
        conn.commit()

# --- API ЭНДПОИНТЫ  ---

@app.route('/api/abnormalities')
def get_abnormalities():
    """Отдает всё содержимое файла abnormalities.json."""
    try:
        with open('abnormalities.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data)
    except FileNotFoundError:
        return jsonify({"error": "abnormalities.json not found"}), 404
    except json.JSONDecodeError:
        return jsonify({"error": "Failed to decode abnormalities.json"}), 500

@app.route('/api/ratings')
def get_all_ratings():
    """Отдает средний рейтинг и количество голосов для каждой аномалии."""
    ratings = {}
    with sqlite3.connect(DB_NAME) as conn:
        conn.row_factory = sqlite3.Row  # Позволяет обращаться к колонкам по имени
        cursor = conn.cursor()
        # SQL-запрос для расчета среднего (AVG) и количества (COUNT) оценок
        cursor.execute('''
            SELECT abnormality_id, AVG(rating) as avg_rating, COUNT(rating) as vote_count
            FROM ratings
            GROUP BY abnormality_id
        ''')
        for row in cursor.fetchall():
            ratings[row['abnormality_id']] = {
                'average': round(row['avg_rating'], 2),
                'count': row['vote_count']
            }
    return jsonify(ratings)

@app.route('/api/rate', methods=['POST'])
def submit_rating():
    """Принимает и сохраняет оценку от пользователя."""
    data = request.json
    abnormality_id = data.get('abnormality_id')
    rating = data.get('rating')
    user_id = data.get('user_id')

    if not all([abnormality_id, rating, user_id]):
        return jsonify({'error': 'Missing data'}), 400

    try:
        with sqlite3.connect(DB_NAME) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "REPLACE INTO ratings (abnormality_id, user_identifier, rating) VALUES (?, ?, ?)",
                (abnormality_id, user_id, rating)
            )
            conn.commit()
        return jsonify({'success': True, 'message': 'Rating saved'})
    except sqlite3.Error as e:
        return jsonify({'error': str(e)}), 500

# --- ОТДАЧА FRONTEND ---

@app.route('/')
def index():
    """Отдает главную страницу сайта."""
    return send_from_directory('.', 'index.html')

# --- ЗАПУСК СЕРВЕРА ---
if __name__ == '__main__':
    init_db() 
    app.run(host='0.0.0.0', port=5000, debug=False)