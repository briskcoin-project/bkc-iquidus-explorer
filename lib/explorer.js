const request = require('request');
const settings = require('./settings');
const Address = require('../models/address');
const Client = require('bitcoin-core');

const client = new Client(settings.wallet);
const base_url = 'http://127.0.0.1:' + settings.port + '/api/';
const SATOSHI_FACTOR = 100000000;

// Helper function for consistent error handling
function handleError(error, context, cb) {
  console.error('Error in ' + context + ':', error);
  if (typeof cb === 'function') {
    cb('There was an error. Check your console.');
  }
}

// Returns coinbase total sent as current coin supply
function coinbase_supply(cb) {
  Address.findOne({ a_id: 'coinbase' }, function(err, address) {
    if (err) {
      handleError(err, 'coinbase_supply');
      return cb(0);
    }
    cb(address ? address.sent : 0);
  });
}

function rpcCommand(params, cb) {
  if (!params || !params.length) {
    return cb('Invalid parameters');
  }

  client.command([{
    method: params[0].method,
    parameters: params[0].parameters || []
  }], function(err, response) {
    if (err) {
      handleError(err, 'rpcCommand');
      return cb('RPC command failed');
    }

    if (!response || !response[0] || (response[0] && response[0].name === 'RpcError')) {
      return cb('Invalid RPC response');
    }

    cb(response[0]);
  });
}

module.exports = {
  convert_to_satoshi: function(amount, cb) {
    try {
      const num = parseFloat(amount);
      if (isNaN(num)) {
        return cb(0);
      }
      const fixed = num.toFixed(8);
      cb(parseInt(fixed.replace('.', ''), 10));
    } catch (e) {
      handleError(e, 'convert_to_satoshi');
      cb(0);
    }
  },

  calculate_total: function(vout, cb) {
    if (!Array.isArray(vout)) {
      return cb(0);
    }

    var total = 0;
    this.syncLoop(vout.length, function(loop) {
      var i = loop.iteration();
      total += parseFloat(vout[i].amount || 0);
      loop.next();
    }, function() {
      cb(total);
    });
  },

  get_hashrate: function(cb) {
    if (settings.index.show_hashrate === false) {
      return cb('-');
    }

    const calculateHashrate = function(value) {
      const hashRate = parseFloat(value);
      if (isNaN(hashRate)) return '-';

      switch (settings.nethash_units) {
        case 'K': return (hashRate * 1000).toFixed(4);
        case 'M': return (hashRate).toFixed(4);
        case 'G': return (hashRate / 1000).toFixed(4);
        case 'T': return (hashRate / 1000000).toFixed(4);
        case 'P': return (hashRate / 1000000000).toFixed(4);
        case 'H': return (hashRate * 1000000).toFixed(4);
        default: return hashRate.toFixed(4);
      }
    };

    if (settings.use_rpc) {
      const method = settings.nethash === 'netmhashps' 
        ? 'getmininginfo' 
        : 'getnetworkhashps';
      
      rpcCommand([{ method: method, parameters: [] }], function(response) {
        const value = settings.nethash === 'netmhashps' 
          ? (response && response.netmhashps)
          : response;
        cb(calculateHashrate(value));
      });
    } else {
      const endpoint = settings.nethash === 'netmhashps' 
        ? 'getmininginfo' 
        : 'getnetworkhashps';
      
      request({
        uri: base_url + endpoint,
        json: true,
        timeout: 15000
      }, function(error, response, body) {
        if (error || !body) {
          handleError(error, 'get_hashrate');
          return cb('-');
        }
        
        const value = settings.nethash === 'netmhashps' 
          ? (body && body.netmhashps)
          : body;
        cb(calculateHashrate(value));
      });
    }
  },

  get_difficulty: function(cb) {
    if (settings.use_rpc) {
      rpcCommand([{ method: 'getdifficulty', parameters: [] }], cb);
    } else {
      request({
        uri: base_url + 'getdifficulty',
        json: true,
        timeout: 10000
      }, function(error, response, body) {
        if (error || !body) {
          handleError(error, 'get_difficulty');
          return cb('Error getting difficulty');
        }
        cb(body);
      });
    }
  },

  get_connectioncount: function(cb) {
    if (settings.use_rpc) {
      rpcCommand([{ method: 'getconnectioncount', parameters: [] }], cb);
    } else {
      request({
        uri: base_url + 'getconnectioncount',
        json: true,
        timeout: 10000
      }, function(error, response, body) {
        if (error || !body) {
          handleError(error, 'get_connectioncount');
          return cb('Error getting connection count');
        }
        cb(body);
      });
    }
  },

  get_blockcount: function(cb) {
    if (settings.use_rpc) {
      rpcCommand([{ method: 'getblockcount', parameters: [] }], cb);
    } else {
      request({
        uri: base_url + 'getblockcount',
        json: true,
        timeout: 10000
      }, function(error, response, body) {
        if (error || !body) {
          handleError(error, 'get_blockcount');
          return cb('Error getting block count');
        }
        cb(body);
      });
    }
  },

  get_blockhash: function(height, cb) {
    if (settings.use_rpc) {
      rpcCommand([{ 
        method: 'getblockhash', 
        parameters: [parseInt(height, 10)] 
      }], cb);
    } else {
      request({
        uri: base_url + 'getblockhash?height=' + height,
        json: true,
        timeout: 10000
      }, function(error, response, body) {
        if (error || !body) {
          handleError(error, 'get_blockhash');
          return cb('Error getting block hash');
        }
        cb(body);
      });
    }
  },

  get_block: function(hash, cb) {
    if (settings.use_rpc) {
      rpcCommand([{ method: 'getblock', parameters: [hash] }], cb);
    } else {
      request({
        uri: base_url + 'getblock?hash=' + hash,
        json: true,
        timeout: 15000
      }, function(error, response, body) {
        if (error || !body) {
          handleError(error, 'get_block');
          return cb('Error getting block');
        }
        cb(body);
      });
    }
  },

  get_rawtransaction: function(hash, cb) {
    if (settings.use_rpc) {
      rpcCommand([{ 
        method: 'getrawtransaction', 
        parameters: [hash, 1] 
      }], cb);
    } else {
      request({
        uri: base_url + 'getrawtransaction?txid=' + hash + '&decrypt=1',
        json: true,
        timeout: 15000
      }, function(error, response, body) {
        if (error || !body) {
          handleError(error, 'get_rawtransaction');
          return cb('Error getting transaction');
        }
        cb(body);
      });
    }
  },

  syncLoop: function(iterations, process, exit) {
    var index = 0;
    var done = false;
    var shouldExit = false;

    if (!iterations || iterations <= 0) {
      if (exit) exit();
      return { next: function() {}, iteration: function() { return -1; }, break: function() {} };
    }

    var next = function() {
      if (done) {
        if (shouldExit && exit) exit();
        return;
      }

      if (index < iterations) {
        var currentIndex = index++;
        try {
          if (currentIndex % 100 === 0) {
            setTimeout(function() { process(loop); }, 1);
          } else {
            process(loop);
          }
        } catch (e) {
          handleError(e, 'syncLoop');
          done = true;
          if (exit) exit();
        }
      } else {
        done = true;
        if (exit) exit();
      }
    };

    var loop = {
      next: next,
      iteration: function() { return index - 1; },
      break: function(end) {
        done = true;
        shouldExit = end;
      }
    };

    next();
    return loop;
  },

  prepare_vout: function(vout, txid, vin, cb) {
    if (!Array.isArray(vout)) {
      return cb([], Array.isArray(vin) ? vin : []);
    }

    var arr_vout = [];
    var arr_vin = Array.isArray(vin) ? vin.slice() : [];

    this.syncLoop(vout.length, function(loop) {
      var i = loop.iteration();
      var output = vout[i];
      
      if (!output || !output.scriptPubKey || 
          (output.scriptPubKey.type === 'nonstandard' || 
           output.scriptPubKey.type === 'nulldata')) {
        return loop.next();
      }

      // Handle both address formats
      var addresses = [];
      if (output.scriptPubKey.addresses && output.scriptPubKey.addresses.length) {
        addresses = output.scriptPubKey.addresses;
      } else if (output.scriptPubKey.address) {
        addresses = [output.scriptPubKey.address];
      }

      if (!addresses.length) {
        return loop.next();
      }

      var address = addresses[0];
      this.is_unique(arr_vout, address, function(unique, index) {
        this.convert_to_satoshi(parseFloat(output.value || 0), function(amount_sat) {
          if (unique) {
            arr_vout.push({ addresses: address, amount: amount_sat });
          } else if (index !== null && arr_vout[index]) {
            arr_vout[index].amount += amount_sat;
          }
          loop.next();
        });
      }.bind(this));
    }.bind(this), function() {
      // Handle PoS special case
      if (vout[0] && vout[0].scriptPubKey && vout[0].scriptPubKey.type === 'nonstandard' &&
          arr_vin.length > 0 && 
          arr_vout.length > 0 &&
          arr_vin[0] && arr_vout[0] &&
          arr_vin[0].addresses === arr_vout[0].addresses) {
        arr_vout[0].amount -= arr_vin[0].amount;
        arr_vin.shift();
      }
      cb(arr_vout, arr_vin);
    });
  },

  is_unique: function(array, object, cb) {
    if (!Array.isArray(array)) {
      return cb(true, null);
    }

    for (var i = 0; i < array.length; i++) {
      if (array[i] && array[i].addresses === object) {
        return cb(false, i);
      }
    }
    return cb(true, null);
  },

  get_input_addresses: function(input, vout, cb) {
    if (!input) return cb([]);

    if (input.coinbase) {
      var amount = 0;
      this.syncLoop(vout.length, function(loop) {
        var i = loop.iteration();
        amount += parseFloat(vout[i] && vout[i].value || 0);
        loop.next();
      }, function() {
        cb([{ hash: 'coinbase', amount: amount }]);
      });
      return;
    }

    this.get_rawtransaction(input.txid, function(tx) {
      if (!tx || !Array.isArray(tx.vout)) {
        return cb([]);
      }

      for (var i = 0; i < tx.vout.length; i++) {
        if (tx.vout[i].n === input.vout) {
          var output = tx.vout[i];
          var addresses = [];
          
          // Handle both address formats
          if (output.scriptPubKey) {
            if (output.scriptPubKey.addresses && output.scriptPubKey.addresses.length) {
              addresses = output.scriptPubKey.addresses;
            } else if (output.scriptPubKey.address) {
              addresses = [output.scriptPubKey.address];
            }
          }

          if (addresses.length) {
            return cb([{
              hash: addresses[0],
              amount: output.value
            }]);
          }
          break;
        }
      }
      cb([]);
    });
  },

  prepare_vin: function(tx, cb) {
    if (!tx || !Array.isArray(tx.vin)) {
      return cb([]);
    }

    var arr_vin = [];
    this.syncLoop(tx.vin.length, function(loop) {
      var i = loop.iteration();
      this.get_input_addresses(tx.vin[i], tx.vout, function(addresses) {
        if (!addresses || !addresses.length) {
          return loop.next();
        }

        var addr = addresses[0];
        this.is_unique(arr_vin, addr.hash, function(unique, index) {
          this.convert_to_satoshi(parseFloat(addr.amount || 0), function(amount_sat) {
            if (unique) {
              arr_vin.push({ addresses: addr.hash, amount: amount_sat });
            } else if (index !== null && arr_vin[index]) {
              arr_vin[index].amount += amount_sat;
            }
            loop.next();
          });
        }.bind(this));
      }.bind(this));
    }.bind(this), function() {
      cb(arr_vin);
    });
  },

  get_supply: function(cb) {
    if (!settings.supply) {
      return coinbase_supply(function(supply) {
        cb(supply / SATOSHI_FACTOR);
      });
    }

    var handleSupply = function(value) {
      var supply = parseFloat(value);
      cb(isNaN(supply) ? 0 : supply);
    };

    if (settings.use_rpc) {
      switch (settings.supply) {
        case 'HEAVY':
          rpcCommand([{ method: 'getsupply', parameters: [] }], handleSupply);
          break;
        case 'GETINFO':
          rpcCommand([{ method: 'getinfo', parameters: [] }], function(response) {
            handleSupply(response && response.moneysupply);
          });
          break;
        case 'TXOUTSET':
          rpcCommand([{ method: 'gettxoutsetinfo', parameters: [] }], function(response) {
            handleSupply(response && response.total_amount);
          });
          break;
        case 'BALANCES':
          this.balance_supply(function(supply) {
            handleSupply(supply / SATOSHI_FACTOR);
          });
          break;
        default:
          coinbase_supply(function(supply) {
            handleSupply(supply / SATOSHI_FACTOR);
          });
      }
    } else {
      switch (settings.supply) {
        case 'HEAVY':
          request({
            uri: base_url + 'getsupply',
            json: true,
            timeout: 15000
          }, function(error, response, body) {
            handleSupply(error ? 0 : body);
          });
          break;
        case 'GETINFO':
          request({
            uri: base_url + 'getinfo',
            json: true,
            timeout: 15000
          }, function(error, response, body) {
            handleSupply(error ? 0 : (body && body.moneysupply));
          });
          break;
        case 'TXOUTSET':
          request({
            uri: base_url + 'gettxoutsetinfo',
            json: true,
            timeout: 30000
          }, function(error, response, body) {
            handleSupply(error ? 0 : (body && body.total_amount));
          });
          break;
        case 'BALANCES':
          this.balance_supply(function(supply) {
            handleSupply(supply / SATOSHI_FACTOR);
          });
          break;
        default:
          coinbase_supply(function(supply) {
            handleSupply(supply / SATOSHI_FACTOR);
          });
      }
    }
  },

  balance_supply: function(cb) {
    Address.find({ balance: { $gt: 0 } })
      .select('balance')
      .lean()
      .exec(function(err, docs) {
        if (err) {
          handleError(err, 'balance_supply');
          return cb(0);
        }
        
        var total = 0;
        for (var i = 0; i < docs.length; i++) {
          total += docs[i].balance || 0;
        }
        cb(total);
      });
  }
};