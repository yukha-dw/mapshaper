
import { getLayerInfo } from '../commands/mapshaper-info';
import { getBaseContext } from '../expressions/mapshaper-expressions';
import { runParsedCommands } from '../cli/mapshaper-run-commands';
import { parseCommands } from '../cli/mapshaper-parse-commands';
import { stop, message } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { getStashedVar } from '../mapshaper-stash';
import cmd from '../mapshaper-cmd';

cmd.run = async function(job, targets, opts) {
  var commandStr, commands;
  if (!opts.expression) {
    stop("Missing expression parameter");
  }
  commandStr = runGlobalExpression(opts.expression, targets);
  // Support async functions as expressions
  if (utils.isPromise(commandStr)) {
    commandStr = await commandStr;
  }
  if (commandStr) {
    message(`command: [${commandStr}]`);
    commands = parseCommands(commandStr);
    await utils.promisify(runParsedCommands)(commands, job);
  }
};

// This could return a Promise or a value or nothing
export function runGlobalExpression(expression, targets) {
  var ctx = getBaseContext();
  var output, targetData;
  // TODO: throw an informative error if target is used when there are multiple targets
  if (targets && targets.length == 1) {
    targetData = getRunCommandData(targets[0]);
    Object.defineProperty(ctx, 'target', {value: targetData});
  }
  // Add defined functions and data to the expression context
  // (Such as functions imported via the -require command)
  utils.extend(ctx, getStashedVar('defs'));
  try {
    output = Function('ctx', 'with(ctx) {return (' + expression + ');}').call({}, ctx);
  } catch(e) {
    stop(e.name, 'in JS source:', e.message);
  }
  return output;
}


function getRunCommandData(target) {
  var lyr = target.layers[0];
  var data = getLayerInfo(lyr, target.dataset);
  data.layer = lyr;
  data.dataset = target.dataset;
  return data;
}
