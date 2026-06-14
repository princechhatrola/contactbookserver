import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule, InjectConnection } from '@nestjs/mongoose';
import { APP_GUARD } from '@nestjs/core';
import { Connection } from 'mongoose';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { LeadsModule } from './modules/leads/leads.module';
import { GroupsModule } from './modules/groups/groups.module';
import { TagsModule } from './modules/tags/tags.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { NotesModule } from './modules/notes/notes.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { ImportsModule } from './modules/imports/imports.module';
import { ExportsModule } from './modules/exports/exports.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { DatadogLogger } from './common/logger/datadog.logger';

const logger = new Logger('AppModule');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const uri = configService.get<string>('MONGODB_URI');
        return {
          uri,
        };
      },
      inject: [ConfigService],
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        if (redisUrl) {
          try {
            const parsed = new URL(redisUrl);
            return {
              connection: {
                host: parsed.hostname,
                port: parsed.port ? parseInt(parsed.port, 10) : 6379,
                username: parsed.username || undefined,
                password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
                db: parsed.pathname ? parseInt(parsed.pathname.substring(1), 10) || 0 : 0,
                tls: parsed.protocol === 'rediss:' ? {} : undefined,
              },
            };
          } catch (error: any) {
            logger.error(`Failed to parse REDIS_URL: ${error.message}. Falling back to default configuration.`);
          }
        }
        return {
          connection: {
            host: configService.get<string>('REDIS_HOST', 'localhost'),
            port: configService.get<number>('REDIS_PORT', 6379),
            password: configService.get<string>('REDIS_PASSWORD'),
          },
        };
      },
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    OrganizationsModule,
    ContactsModule,
    LeadsModule,
    GroupsModule,
    TagsModule,
    TasksModule,
    NotesModule,
    ActivitiesModule,
    AuditLogsModule,
    ImportsModule,
    ExportsModule,
    ApiKeysModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    DatadogLogger,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantGuard,
    },
  ],
})
export class AppModule {
  constructor(@InjectConnection() private readonly connection: Connection) {
    // Check initial state
    if (this.connection.readyState === 1) {
      logger.log('Database Connection Check: MongoDB connection is open and ready.');
    } else {
      logger.warn(`Database Connection Check: MongoDB readyState is ${this.connection.readyState}`);
    }

    // Monitor events
    this.connection.on('connected', () => {
      logger.log('Database Event: MongoDB connection successfully established.');
    });

    this.connection.on('disconnected', () => {
      logger.warn('Database Event: MongoDB connection disconnected.');
    });

    this.connection.on('error', (err) => {
      logger.error(`Database Event: MongoDB connection encountered error: ${err.message}`);
    });
  }
}
