import { Module } from "@nestjs/common";
import { HealthController } from "./Controller/Health/health.controller.js";

@Module({ controllers: [HealthController] })
export class AppModule {}
