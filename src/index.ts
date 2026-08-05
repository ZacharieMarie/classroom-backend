import express from 'express'
import {subjects} from "./db/schema/index.js";
import subjectsRouter from "./routes/subjects.js"
import cors from "cors"

const app = express();
const PORT = 8000;
if (!process.env.FRONTEND_URL) {
    throw new Error("Missing FRONTEND_URL: may not be set in the .env file");
}

app.use(cors({
    origin: process.env.FRONTEND_URL,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}))

app.use(express.json());

app.use('/api/subjects', subjectsRouter);

app.get('/', (req, res) => {
    res.send('Hello, Welcome to the classroom API')
});

app.listen(PORT, () => console.log(`Server is running at http://localhost:${PORT}`));