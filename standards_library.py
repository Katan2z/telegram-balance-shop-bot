"""Local PDF search index. Source documents are never committed to Git."""
import io
import re
import sqlite3
import threading
from contextlib import closing
from pathlib import Path

import pypdfium2 as pdfium

PDF_LOCK = threading.Lock()  # PDFium is not thread safe.
ROOT = Path('.standards')


def normalize(value):
    return ' '.join(re.findall(r'[\w]+', value.casefold().replace('ё', 'е')))


def build_index(root=ROOT):
    root = Path(root)
    with PDF_LOCK, closing(sqlite3.connect(root / 'index.sqlite')) as db, db:
        db.execute('CREATE TABLE IF NOT EXISTS pages (document TEXT, page INTEGER, title TEXT, text TEXT)')
        db.execute('DELETE FROM pages')
        total = 0
        for source in sorted(root.glob('*.pdf')):
            with closing(pdfium.PdfDocument(source)) as doc:
                for number in range(len(doc)):
                    with closing(doc[number]) as page, closing(page.get_textpage()) as textpage:
                        text = textpage.get_text_range()
                    title = ' · '.join(line.strip() for line in text.splitlines() if line.strip())[:100]
                    db.execute('INSERT INTO pages VALUES (?,?,?,?)', (source.name, number, title, normalize(text)))
                    total += 1
        return total


def search(query, limit=10, root=ROOT):
    words = normalize(query).split()
    words = ['томат' if word in {'томаты', 'томата', 'томатов', 'помидор', 'помидоры', 'помидоров'} else word for word in words]
    if not words or len(query) > 150:
        raise ValueError('Введите ключевое слово или короткую фразу (до 150 символов).')
    index = Path(root) / 'index.sqlite'
    if not index.exists():
        raise FileNotFoundError('База стандартов пока не подключена.')
    with closing(sqlite3.connect(index)) as db:
        rows = db.execute('SELECT document,page,title,text FROM pages').fetchall()
    matches = []
    recipe_query = any(word.startswith(('рецепт', 'сборк', 'бургер', 'воппер')) for word in words)
    for document, page, title, text in rows:
        # All query words must occur. No generated or guessed standards.
        if all(word in text for word in words):
            score = sum(normalize(title).count(word) * 20 + min(text.count(word), 20) for word in words)
            position = text.find(words[0])
            # Rank actual product handling above incidental mentions in recipes.
            document_name = normalize(document)
            windows = [text[max(0, match.start() - 180):match.end() + 400]
                       for match in re.finditer(re.escape(words[0]), text)]
            storage = any(any(cue in window for cue in ('срок хран', 'срок годност', 'температур', 'условия хран', 'хранить', 'хранени')) for window in windows)
            preparation = 'приготовление ингредиентов' in document_name
            recipe = 'позиции в меню' in document_name
            category = ''
            if not recipe_query:
                score += (100 if storage else 0) + (80 if preparation else 0) - (180 if recipe else 0)
                if storage and not recipe:
                    category = 'Хранение/температура'
                elif preparation:
                    category = 'Подготовка продукта'
                elif recipe:
                    category = 'Рецептура'
            snippet = text[max(0, position - 15):position + 75]
            matches.append({'document': document, 'page': page, 'title': snippet, 'category': category, 'score': score})
    return sorted(matches, key=lambda row: (-row['score'], row['document'], row['page']))[:limit]


def render_page(document, number, root=ROOT):
    root = Path(root).resolve()
    source = (root / document).resolve()
    if source.parent != root or source.suffix.lower() != '.pdf':
        raise ValueError('Недопустимый документ')
    with PDF_LOCK, closing(pdfium.PdfDocument(source)) as doc:
        if not 0 <= number < len(doc):
            raise ValueError('Страница не найдена')
        with closing(doc[number]) as page:
            scale = min(2.5, 2200 / max(page.get_size()))
            bitmap = page.render(scale=scale)
            try:
                image = bitmap.to_pil().convert('RGB')
                output = io.BytesIO()
                image.save(output, 'JPEG', quality=90)
                return output.getvalue()
            finally:
                bitmap.close()
