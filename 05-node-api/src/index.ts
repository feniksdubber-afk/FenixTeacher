import "dotenv/config";
import express from "express";
import { usersRouter } from "./routes/users.js";
import { coursesRouter } from "./routes/courses.js";
import { uploadRouter } from "./routes/upload.js";
import { booksRouter } from "./routes/books.js";
import { internalRouter } from "./routes/internal.js";
import { exercisesRouter } from "./routes/exercises.js";
import { wordsRouter } from "./routes/words.js";
import { reportsRouter } from "./routes/reports.js";
import { ttsRouter } from "./routes/tts.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ holati: "ishlayapti" }));

app.use("/users", usersRouter);
app.use("/courses", coursesRouter);
app.use("/upload", uploadRouter);
app.use("/books", booksRouter);
app.use("/internal", internalRouter);
app.use("/", exercisesRouter); // /chapters/:id/exercises, /exercises/:id/*
app.use("/", wordsRouter); // /courses/:id/words*, /words/:id/review
app.use("/", reportsRouter); // /courses/:id/weekly-report*
app.use("/", ttsRouter); // /tts

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[api] kutilmagan xato:", err);
  res.status(500).json({ xato: "server xatosi" });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`[api] FenixTeacher Node API ${port}-portda ishga tushdi`);
});
