import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaService } from "../prisma.service";
import { Hot1688Service } from "./service/1688.service";
import { Scraper1688Service } from "./scraper/1688.scraper";
import { PlaywrightScraper1688Service } from "./scraper/playwright-scraper";
import { AlibabaApiClient } from "./scraper/api-client";
import { HeatScoringService } from "./score/heat.scorer";
import { RichPushService } from "./telegram/rich-push.service";

@Module({
  imports: [ScheduleModule],
  providers: [
    Hot1688Service,
    Scraper1688Service,
    PlaywrightScraper1688Service,
    AlibabaApiClient,
    HeatScoringService,
    RichPushService,
    PrismaService,
  ],
  exports: [Hot1688Service, PlaywrightScraper1688Service, AlibabaApiClient],
})
export class Hot1688Module {}
