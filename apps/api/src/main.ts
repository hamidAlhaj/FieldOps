import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { readEnvironment } from "./config/environment";
import { configureApp } from "./config/configure-app";
async function bootstrap() {
  const config = readEnvironment();
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(config.PORT, "0.0.0.0");
}
bootstrap().catch(() => {
  console.error(
    "API startup failed; check configuration and database availability.",
  );
  process.exit(1);
});
