import tempfile
import unittest
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image
import io
import sqlite3
from contextlib import closing

from standards_library import normalize, search, render_page


class StandardsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        with closing(sqlite3.connect(self.root / 'index.sqlite')) as db, db:
            db.execute('CREATE TABLE pages(document TEXT,page INTEGER,title TEXT,text TEXT)')
            db.executemany('INSERT INTO pages VALUES (?,?,?,?)', [
                ('test.pdf', 0, 'Фритюр', normalize('Фритюр чистка ёмкости')),
                ('test.pdf', 1, 'Другое', normalize('Фритюр и масло')),
            ])

    def tearDown(self):
        self.tmp.cleanup()

    def test_search_case_and_yo(self):
        result = search('ФРИТЮР емкости', root=self.root)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['page'], 0)

    def test_title_matches_rank_first_and_limit(self):
        self.assertEqual(search('фритюр', limit=1, root=self.root)[0]['page'], 0)

    def test_no_matches_and_invalid_query(self):
        self.assertEqual(search('бургер', root=self.root), [])
        with self.assertRaises(ValueError):
            search('???', root=self.root)

    def test_render_and_traversal(self):
        with closing(pdfium.PdfDocument.new()) as doc:
            page = doc.new_page(600, 800)
            page.close()
            doc.save(self.root / 'test.pdf')
        data = render_page('test.pdf', 0, root=self.root)
        image = Image.open(io.BytesIO(data))
        self.assertEqual(image.format, 'JPEG')
        self.assertLessEqual(max(image.size), 2200)
        with self.assertRaises(ValueError):
            render_page('../test.pdf', 0, root=self.root)
        with self.assertRaises(ValueError):
            render_page('test.pdf', -1, root=self.root)
