import fs from 'fs';
import path from 'path';
import express from 'express';
import { fileURLToPath } from 'url';
import multer from 'multer';
import mp4Generator from './mp4-generator.mjs';

const app = express();
app.use(express.static('public'));

const port = 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputFilePath = path.join(__dirname, 'public', 'curation-feed.mp4');

const tmpDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir);
}

const storage = multer.diskStorage({
  destination: tmpDir,
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

const emptyTmpDir = dir => fs.readdir(dir, (err, files) => {
  if (err) throw err;

  for (const file of files) {
    fs.unlink(path.join(dir, file), (err) => {
      if (err) throw err;
    });
  }
});

app.post('/convert_images_to_slideshow', upload.array('imagefiles'), async (req, res) => {
  const imgFiles = req.files;

  if (!imgFiles || imgFiles.length < 1) {
    return res.status(400).send({ error: 'No image files provided.' });
  }

  try {
    await mp4Generator(imgFiles, outputFilePath)
    emptyTmpDir(tmpDir);
    res.status(200).send({ msg: 'Nailed it.' });
  } catch(err) {
    emptyTmpDir(tmpDir);
    return res.status(500).send({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
