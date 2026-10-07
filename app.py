import math

from flask import Flask, render_template, request, url_for

import db

app = Flask(__name__)
PER_PAGE = 50

db.init_db()


@app.template_filter("money")
def money(value):
    return "–" if value is None else f"£{value:,.2f}"


@app.template_filter("percent")
def percent(value):
    return "–" if value is None else f"{value:+.1f}%"


@app.template_global()
def url_with(**changes):
    # current url with some query params changed, None removes a param
    args = request.args.to_dict()
    args.update(changes)
    args = {key: value for key, value in args.items() if value not in (None, "")}
    return url_for(request.endpoint, **args)


@app.context_processor
def inject_demo_flag():
    return {"has_demo": db.has_demo_data()}


def get_filters():
    q = request.args.get("q", "").strip()
    show = request.args.get("show", "all")
    if show not in ("all", "drops", "rises"):
        show = "all"
    return q, show


def get_sorting():
    sort = request.args.get("sort", "title")
    if sort not in db.SORTS:
        sort = "title"
    direction = "desc" if request.args.get("dir") == "desc" else "asc"
    return sort, direction


@app.route("/")
def index():
    q, show = get_filters()
    sort, direction = get_sorting()

    total = db.count_products(q, show)
    pages = max(1, math.ceil(total / PER_PAGE))
    page = min(max(request.args.get("page", 1, type=int), 1), pages)
    products = db.list_products(q, show, sort, direction, PER_PAGE, (page - 1) * PER_PAGE)

    return render_template(
        "index.html",
        products=products, total=total, page=page, pages=pages, per_page=PER_PAGE,
        q=q, show=show, sort=sort, direction=direction, stats=db.get_stats(),
    )


if __name__ == "__main__":
    app.run(debug=True)
