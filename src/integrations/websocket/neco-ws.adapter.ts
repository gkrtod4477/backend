import { INestApplicationContext } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';

export class NecoWsAdapter extends WsAdapter {
  constructor(appOrHttpServer?: INestApplicationContext | object) {
    super(appOrHttpServer);
  }
}
