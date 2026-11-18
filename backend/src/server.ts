import "dotenv/config"; // must load before ./app reads process.env
import app from "./app";

const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
