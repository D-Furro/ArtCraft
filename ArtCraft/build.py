import os

html_path = "index.html"
css_path = "style.css"
engine_path = "engine.js"
storage_path = "storage.js"
ui_path = "ui.js"
out_path = "ArtCraft-completo.html"

with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()
with open(css_path, 'r', encoding='utf-8') as f:
    css = f.read()
with open(engine_path, 'r', encoding='utf-8') as f:
    engine = f.read()
with open(storage_path, 'r', encoding='utf-8') as f:
    storage = f.read()
with open(ui_path, 'r', encoding='utf-8') as f:
    ui = f.read()

# Remove external links
html = html.replace('<link rel="stylesheet" href="style.css">', f"<style>\n{css}\n</style>")
html = html.replace('<script src="storage.js"></script>', "")
html = html.replace('<script src="engine.js"></script>', "")
html = html.replace('<script src="ui.js"></script>', f"<script>\n{storage}\n{engine}\n{ui}\n</script>")

with open(out_path, 'w', encoding='utf-8') as f:
    f.write(html)

print("Gerado:", out_path)
