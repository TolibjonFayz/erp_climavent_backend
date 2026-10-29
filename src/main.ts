import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppExceptionFilter } from './common/filters/app-exception.filter';

import { NestExpressApplication } from '@nestjs/platform-express';

const start = async () => {
  try {
    const PORT = process.env.PORT || 3333;

    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    app.set('trust proxy', 1);
    app.setGlobalPrefix('api');

    app.use(helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }));
    // JSON javoblarni gzip bilan siqish: dogovor/all (~8.7k qator) 6.7 MB → ~0.5 MB
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    app.use(require('compression')());

    app.enableCors({
      origin: true, // Accepts any origin dynamically (required for credentials: true across different domains)
      methods: 'GET,PUT,PATCH,POST,DELETE,OPTIONS',
      allowedHeaders: 'Content-Type, Authorization, Accept',
      credentials: true,
      optionsSuccessStatus: 200,
    });

    const config = new DocumentBuilder()
      .setTitle('ERP Climavent backend')
      .setDescription('ERP Backend project for Climavent company')
      .setVersion('1.0.0')
      .addTag('NestJS, Postgres, Sequelize')
      .build();
    // API xaritasi ochiq internetda ko'rinmasin — kerak bo'lsa SWAGGER_ENABLED=true bilan yoqiladi
    if (process.env.SWAGGER_ENABLED === 'true') {
      const document = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup('/api/docs', app, document);
    }

    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe());
    // Baza xatolari (dublikat, uzun matn va h.k.) 500 o'rniga tushunarli xabar bilan qaytadi
    app.useGlobalFilters(new AppExceptionFilter(app.get(HttpAdapterHost).httpAdapter));
    await app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.log(error);
  }
};
start();
