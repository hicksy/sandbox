let read = require('@architect/inventory/src/read')
let defaultFunctionConfig = require('@architect/inventory/src/defaults/function-config')
let invoker = require('./')

exports.invokePluginFunction = function(params, { src, payload }, callback) {
  invoker({
    event: payload,
    lambda: {
      src,
      config: getFunctionConfig(src),
      _skipHandlerCheck: true // short circuits Lambda invocation handler check
    },
    ...params,
  }, callback)
}

exports.plugin = {
  hasRuntime: function({config, inv}) {
    return Object.values(inv._project.plugins).
      map(pluginModule => pluginModule?.sandbox?.runtime || null).
      filter(runtime => runtime.name === config.runtime).length > 0
  },
  getRuntime: function({config, inv}) {
    return Object.values(inv._project.plugins).
      map(pluginModule => pluginModule?.sandbox?.runtime || null).
      find(runtime => runtime.name === config.runtime)
  } 
}

// compile any per-function config.arc customizations
function getFunctionConfig (dir) {
  let defaults = defaultFunctionConfig()
  let customizations = read({ type: 'functionConfig', cwd: dir }).arc.aws
  let overrides = {}
  for (let config of customizations) {
    overrides[config[0]] = config[1]
  }
  return { ...defaults, ...overrides }
}
