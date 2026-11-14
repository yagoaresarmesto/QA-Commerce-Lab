import { Global, Module } from '@nestjs/common';
import { FaultInjectionInterceptor } from './fault-injection.interceptor';
import { FaultsService } from './faults.service';

@Global()
@Module({ providers: [FaultsService, FaultInjectionInterceptor], exports: [FaultsService, FaultInjectionInterceptor] })
export class FaultsModule {}
