Given the requirements, we will be using Python with Flask for the backend and HTML, CSS, and JavaScript for the frontend. We will also use SQLAlchemy for the database and WTForms for form handling. 

Here are the core classes, functions, and methods that will be necessary:

1. `Poem`: This class will represent a poem in the database. It will have fields for the title, text, author, and date posted.

2. `Comment`: This class will represent a comment in the database. It will have fields for the comment text, the poem it's associated with, and the date it was posted.

3. `PoemForm`: This class will represent the form for uploading a new poem. It will have fields for the title, text, and author.

4. `CommentForm`: This class will represent the form for posting a new comment. It will have a field for the comment text.

5. `index()`: This function will handle requests to the homepage. It will fetch the most recent poems from the database and render them on the page.

6. `poem()`: This function will handle requests to a specific poem's page. It will fetch the poem and its comments from the database and render them on the page.

7. `upload()`: This function will handle requests to the upload page. It will display the upload form and handle form submissions.

8. `post_comment()`: This function will handle posting a new comment. It will add the comment to the database and refresh the page.

Now, let's start with the entrypoint file, `app.py`.

app.py
