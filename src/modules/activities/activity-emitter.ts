import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

@Injectable()
export class ActivityEmitter extends EventEmitter {}
