import { Controller, Get } from "@nestjs/common";
import { Public } from "../../Infrastructure/Auth/public.decorator.js";

@Controller("health")
export class HealthController {
  // Liveness do orquestrador: probe de infra não carrega credencial.
  @Public()
  @Get()
  check(): { status: "ok" } {
    return { status: "ok" };
  }
}
