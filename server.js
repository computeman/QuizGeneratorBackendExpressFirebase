import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import cors from "cors";
import admin from "firebase-admin";

dotenv.config();

const app = express();
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    next();
});
const corsOptions = {
    origin: "http://localhost:5173",
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
};

app.use(cors(corsOptions));

app.use(bodyParser.json());

const port = 8080;

// Initialize Firebase Admin SDK
const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: "No token provided" });
    }
    const token = authHeader.split(" ")[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken; // Attach the decoded token to the request
        next();
    } catch (error) {
        console.error("Error while verifying token", error);
        return res.status(401).json({ error: "Unauthorized" }); // Token invalid or missing
    }
};

app.post("/gemini", authenticateToken, async (req, res) => {
    const { topic } = req.body;

    try {
        const chat = model.startChat({
            history: [
                {
                    role: "user",
                    parts: [{ text: "Hello" }],
                },
                {
                    role: "model",
                    parts: [{ text: "Great to meet you. What would you like to know?" }],
                },
            ],
        });

        const prompt = `Generate 5 multiple-choice quiz questions about ${topic}. Each question should have 4 possible answer choices and an explanation. Return the results as a JSON array of objects. Each object should have the following structure: { "question": "the question string", "options": ["option 1", "option 2", "option 3", "option 4"], "correctAnswer": "the correct answer", "explanation": "The explanation for this question" }. If the explanation includes code snippets, please wrap them in triple backticks like this: \`\`\`code snippet here\`\`\`.  
        Make sure that only one correct answer is provided in the options array for every question.
        
        For example:  [ {  "question": "Which planet is known as the 'Red Planet'?",  "options": ["Earth", "Mars", "Jupiter", "Venus"], "correctAnswer": "Mars", "explanation": "Mars is known as the red planet due to the iron oxide on its surface."}, { "question": "What is the capital of France?",    "options": ["London", "Berlin", "Paris", "Rome"], "correctAnswer": "Paris", "explanation": "Paris is the capital and most populous city of France." } ]`;

        const result = await chat.sendMessage(prompt);
        const responseText = result.response.text();
        // remove the backticks and "json" at the beginning of the string
        const cleanText = responseText.replace(/```json\s*|```/g, "");

        try {
            const quizData = JSON.parse(cleanText);
            res.json({ quiz: quizData });
        } catch (e) {
            console.error(
                "Error while parsing json, check the response of Gemini",
                e
            );
            res
                .status(500)
                .json({ error: "There was an error with gemini's response." });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to generate quiz" });
    }
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});