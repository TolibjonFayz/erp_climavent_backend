import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

const start = async () => {
  try {
    const PORT = process.env.PORT || 3333;

    const app = await NestFactory.create(AppModule);
    app.setGlobalPrefix('api');

    app.enableCors({
      origin: '*',
      methods: 'GET,PUT,PATCH,POST,DELETE',
      allowedHeaders: 'Content-Type, Authorization',
      credentials: true,
      optionsSuccessStatus: 200,
    });

    const config = new DocumentBuilder()
      .setTitle('ERP Climavent backend')
      .setDescription('ERP Backend project for Climavent company')
      .setVersion('1.0.0')
      .addTag('NestJS, Postgres, Sequelize')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('/api/docs', app, document);

    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe());
    await app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.log(error);
  }
};
start();
