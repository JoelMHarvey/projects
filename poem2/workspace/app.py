from datetime import datetime
from flask import Flask, render_template, request, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from forms import PoemForm, CommentForm

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///test2.db'
db = SQLAlchemy(app)

class Poem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    text = db.Column(db.Text, nullable=False)
    author = db.Column(db.String(50), nullable=False)
    date_posted = db.Column(db.DateTime, default=datetime.utcnow)

class Comment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    text = db.Column(db.Text, nullable=False)
    poem_id = db.Column(db.Integer, db.ForeignKey('poem.id'), nullable=False)
    date_posted = db.Column(db.DateTime, default=datetime.utcnow)

if __name__ == '__main__':
    db.create_all()
    app.run(debug=True)

@app.route('/')
def index():
    poems = Poem.query.order_by(Poem.date_posted.desc()).all()
    return render_template('index.html', poems=poems)

@app.route('/poem/<int:poem_id>', methods=['GET', 'POST'])
def poem(poem_id):
    poem = Poem.query.get(poem_id)
    form = CommentForm()

    if form.validate_on_submit():
        comment = Comment(text=form.text.data, poem_id=poem_id)
        db.session.add(comment)
        db.session.commit()
        return redirect(url_for('poem', poem_id=poem_id))

    comments = Comment.query.filter_by(poem_id=poem_id).all()
    return render_template('poem.html', poem=poem, comments=comments, form=form)

@app.route('/upload', methods=['GET', 'POST'])
def upload():
    form = PoemForm()

    if form.validate_on_submit():
        poem = Poem(title=form.title.data, text=form.text.data, author=form.author.data)
        db.session.add(poem)
        db.session.commit()
        return redirect(url_for('index'))

    return render_template('upload.html', form=form)


