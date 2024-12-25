// server.js
import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import cors from "cors";
import admin from "firebase-admin";

dotenv.config();

const app = express();
app.use(
  cors({
    origin: "https://quiz-generator-gemini-ai.vercel.app",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    allowedHeaders: "Content-Type,Authorization",
  })
);
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
    const prompt = `Generate 5 multiple-choice quiz questions about ${topic}. Each question should have 4 possible answer choices. Return the results as a JSON array of objects. Each object should have the following structure: { "question": "the question string", "options": ["option 1", "option 2", "option 3", "option 4"], "correctAnswer": "the correct answer" }
Make sure that only one correct answer is provided in the options array for every question.
For example:  [ {  "question": "Which planet is known as the 'Red Planet'?",  "options": ["Earth", "Mars", "Jupiter", "Venus"], "correctAnswer": "Mars" }, { "question": "What is the capital of France?",    "options": ["London", "Berlin", "Paris", "Rome"], "correctAnswer": "Paris" } ]`;

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
