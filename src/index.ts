import express from 'express'
import {subjects} from "./db/schema/index.js";
import subjectsRouter from "./routes/subjects.js"

const app = express();
const PORT = 8000;

app.use(express.json());

app.use('/api/subjects', subjectsRouter);

app.get('/', (req, res) => {
    res.send('Hello, Welcome to the classroom API')
});

app.listen(PORT, () => console.log(`Server is running at http://localhost:${PORT}`));