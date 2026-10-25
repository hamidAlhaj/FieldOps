import { INestApplication, ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { readEnvironment } from "./environment";
export function configureApp(app: INestApplication) {
  const config = readEnvironment();
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix("api/v1");
  app.enableCors({ origin: config.WEB_ORIGIN, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  if (config.NODE_ENV !== "production")
    SwaggerModule.setup(
      "api/docs",
      app,
      SwaggerModule.createDocument(
        app,
        new DocumentBuilder()
          .setTitle("FieldOps API")
          .setVersion("1")
          .addBearerAuth()
          .addCookieAuth(
            "fieldops_refresh",
            { type: "apiKey", in: "cookie" },
            "refreshCookie",
          )
          .build(),
      ),
    );
}
