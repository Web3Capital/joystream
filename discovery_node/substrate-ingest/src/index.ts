/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/unbound-method */

// Required imports
import { registerJoystreamTypes } from '@joystream/types';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { Command } from 'commander'; 

import Config from './Config';
import { StateKeeper, State } from './StateKeeper'
import JoyNode  from './joynode/JoyNode'
import ESUploader from './esearch/ESUploader'

const command = new Command();

async function main () {
  
  command
    .version('0.0.1')
    .description("Joystream ElasticSearch import tool")
    .option('-c, --config <file>', 'path to config', 'config.yml')
    .option('-d --debug', 'debug')
    .parse(process.argv);

  const config = new Config(command.config);

  // responsible for uploading docs to ES
  const esUploader = new ESUploader(config);
  // responsible for keeping track of the pipeline state 
  const stateKeeper = new StateKeeper(config);
  // responsible for emitting the blockchain events & data
  const joyNode = await JoyNode.build(config);

  const state: State = await stateKeeper.state();
  await joyNode.run(state);

  // catching signals and do something before exit
  process.on('beforeExit', async () => {
    console.log("Stopping the node");
    await joyNode.stop();
  });

}

main().catch(console.error).finally(() => process.exit());