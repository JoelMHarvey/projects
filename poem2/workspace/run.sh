python3 -m venv venv
source venv/bin/activate
pip install flask flask_sqlalchemy flask_wtf

export FLASK_APP=app.py
flask run
