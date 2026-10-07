from flask import Flask, jsonify

import db

# the website lives in web/ and is served from the root url
app = Flask(__name__, static_folder="web", static_url_path="")
app.json.compact = True

db.init_db()


@app.route("/")
def index():
    return app.send_static_file("index.html")


@app.route("/data.json")
def data():
    return jsonify(db.export_data())


if __name__ == "__main__":
    app.run(debug=True)
