let { join } = require('path')
let { existsSync } = require('fs')
let chalk = require('chalk')

let getEnv = require('./env')
let exec = require('./exec')
let warn = require('./warn')
let missingRuntime = require('./missing-runtime')

let {plugin} = require('../invoke-lambda/_plugin')
let serialize = i => chalk.dim(JSON.stringify(i, null, 2))

module.exports = function invokeLambda (params, callback) {
  let { apiType, cwd, event, inventory, lambda, staticPath, update } = params
  let { inv } = inventory
  // handlerFile is defined for all non-ASAP functions; ASAP bypasses this check
  if (!hasHandler(lambda, inventory)) {
    callback(Error('lambda_not_found'))
  }
  else {
    // Next check payload size is within limits
    let maxSize = 1000 * 6000
    let { body, Records } = event
    let bodySize = body && JSON.stringify(body).length || 0
    let payloadSize = Records && JSON.stringify(Records).length || 0
    if (bodySize > maxSize || payloadSize > maxSize) {
      let err = Error('Maximum event body exceeded: Lambda allows up to 6MB payloads (base64-encoded)')
      callback(err)
    }
    else {
      // Now send along for execution
      let { src, config, arcStaticAssetProxy } = lambda
      let { runtime, timeout } = config
      let lambdaPath = src.replace(cwd, '').substr(1)

      update.debug.status(`Lambda config: ${lambdaPath}`)
      update.debug.raw(serialize(lambda))

      let max = 10000
      let output = serialize(event).substr(0, max)
      let chonky = output.length === 10000
      update.verbose.status(`Lambda event payload: ${lambdaPath}`)
      update.verbose.raw(output + '...')
      if (chonky) update.verbose.status('Truncated event payload log at 10KB')

      let run
      if (runtime.startsWith('nodejs'))     run = 'node'
      if (runtime.startsWith('deno'))       run = 'deno'
      if (runtime.startsWith('python'))     run = 'python'
      if (runtime.startsWith('ruby'))       run = 'ruby'
      if (arcStaticAssetProxy)              run = 'asap'
      if (plugin.hasRuntime({config, inv})) run = plugin.getRuntime({config, inv}).name
      if (!run) {
        missingRuntime({ cwd, runtime, src, update })
        return callback('Missing runtime')
      }
      exec(run, {
        // Internal execution context
        context: { apiType, inventory, staticPath, update },
        // Child process options
        options: {
          cwd: src,
          env: getEnv(params),
          shell: true,
        },
        request: JSON.stringify(event),
        timeout: timeout * 1000,
      }, function done (err, result, meta = {}) {
        if (err) callback(err)
        else {
          let { missing, debug } = meta
          // Dependency warning debugger - handy for introspection during Lambda execution
          if (debug) {
            update.debug.status(`Lambda debug data: ${lambdaPath}`)
            update.debug.raw(serialize(debug))
          }
          warn({ missing, inventory, src, update })
          callback(null, result)
        }
      })
    }
  }
}

// Handle multi-handler exploration here
function hasHandler (lambda, inventory) {
  let { src, handlerFile, arcStaticAssetProxy, _skipHandlerCheck } = lambda
  let { inv } = inventory
  // We don't need to do a handlerFile check if it's an ASAP / Arc 6 greedy root req
  if (arcStaticAssetProxy || _skipHandlerCheck) return true
  let { runtime } = lambda.config
  if (plugin.hasRuntime({config: lambda.config, inv})) {
    let found = false
    let paths = [
      join(src, plugin.getRuntime({config: lambda.config, inv}).functionHandler)
    ]
    paths.forEach(p => {
      if (found) return
      if (existsSync(p)) found = p
    })
    return found
  }
  if (runtime === 'deno') {
    let found = false
    let paths = [
      join(src, 'index.js'),
      join(src, 'mod.js'),
      join(src, 'index.ts'),
      join(src, 'mod.ts'),
      join(src, 'index.tsx'),
      join(src, 'mod.tsx'),
    ]
    paths.forEach(p => {
      if (found) return
      if (existsSync(p)) found = p
    })
    return found
  }
  else return handlerFile && existsSync(handlerFile)
}
