//quack.constants.js
var Quack = (function(Quack, $, undefined) {
  //Quack constants
  Quack.constants = {};

  Quack.constants.version = "1.4";
  Quack.constants.isPlugin = true;
  Quack.constants.isTestnet = false;
  Quack.constants.broadcast = true;
  Quack.constants.nxtApiUrl = "http://localhost:7876/nxt";

  if(Quack.constants.isPlugin) {
    Quack.constants.isTestnet = NRS.isTestNet;
  }

  if(Quack.constants.isTestnet)
  {
    Quack.constants.nxtApiUrl = "http://localhost:6876/nxt";
  }

  if(Quack.constants.isPlugin) {
    Quack.constants.nxtApiUrl = "nxt";
  }

  Quack.constants.triggerAccount = "NXT-DAXR-PR6C-EA3X-8YGM4";

  if(Quack.constants.isTestnet)
  {
    Quack.constants.triggerAccount = "NXT-YTBB-LT9J-SRRR-7KLBQ";
  }

  Quack.constants.triggerFee = 250000000;
  //default blocks count for a swap session
  Quack.constants.swapBlocks = 1440;
  Quack.constants.defaultConfirmations = 0;
  Quack.constants.defaultMessage = "You've got new Quack request. Use Quack plugin to check and accept the request.";

  return Quack;
} (Quack || {}, jQuery));

//quack.utils.js
var Quack = (function(Quack, $, undefined) {
  //Quack utils
  Quack.utils = {};

  Quack.utils.txTime = function(txTimestamp) {
    ///TODO: remove NRS dependency here
    return NRS.formatTimestamp(txTimestamp);
  }

  Quack.utils.now = function() {
    var d = new Date(2013, 10, 24, 12, 0, 0, 0);
    return Math.round((new Date().getTime() - d.getTime() + 500) / 1000);
  }

  Quack.utils.failed = function(callback) {
    callback({"ret": "error", "result": {"error": "timeout"}});
  }

  Quack.utils.errored = function(callback, result) {
    console.log("error from NRS: " + JSON.stringify(result));
    callback({"ret": "error", "result": result});
  }

  Quack.utils.txqueued = function(tx, queue, maxlength, callback) {

    var txid = tx.transaction;
    if (txid) {
      console.log("Queued transaction: " + txid);
      queue.push({"ret": "ok", "result": txid});
    } else {
      console.log("error from NRS: " + tx);
      queue.push({"ret": "error", "result": tx});
    }

    queueReadyCallback(queue, maxlength, callback);
  }

  Quack.utils.txqueuedHash = function(tx, queue, maxlength, hash, callback) {

    var txid = tx.transaction;
    if (txid) {
      console.log("Queued transaction: " + txid);
      queue.push({"ret": "ok", "result": txid, "tx": tx});
    } else {
      console.log("error from NRS: " + tx);
      queue.push({"ret": "error", "result": tx});
    }

    queueReadyCallbackHash(queue, maxlength, hash, callback);
  }

  Quack.utils.txok = function(state, counter, status, callback) {
    if (status == "ok") {
      counter.ok++;
    } else {
      counter.errors++;
    }

    okReadyCallback(state, counter, callback);
  }

  Quack.utils.getDecimals = function(assets, callback) {
    var length = assets.length;
    var state = assets;
    var counter = {"ok": 0, "errors": 0, "maxcount": 0};
    counter.maxcount = length;

    for (i = 0; i < length; i++) {
      var asset = assets[i];
      var assetId = asset.id;

      var apiobject = {};

      if (asset.type == "A") {
        apiobject = {
          "requestType": "getAsset",
          "asset": assetId
        };
      } else if (asset.type == "M") {
        apiobject = {
          "requestType": "getCurrency",
          "currency": assetId
        };
      } else if (asset.type == "NXT") {
        state[i].decimals = 8;
        Quack.utils.txok(state, counter, "ok", callback);
        continue;
      } else {
        state[i].decimals = -1;
        Quack.utils.txok(state, counter, "ok", callback);
        continue;
      }

      $.ajax({
        url: Quack.constants.nxtApiUrl,
        dataType: "json",
        type: "POST",
        context:{"id":state[i].id},
        data: apiobject
      }).done(function (result) {
        var decimals = result.decimals;
        if(typeof decimals === "undefined") decimals = -1;

        for (k = 0; k < length; k++) {
          if(state[k].id == this.id) {
            state[k].decimals = decimals;
          }
        }

        Quack.utils.txok(state, counter, "ok", callback);

      }).fail(function () {
        for (k = 0; k < length; k++) {
          if(state[k].id == this.id) {
            state[k].decimals = -1;
          }
        }

        Quack.utils.txok(state, counter, "error", callback);
      });
    }
  }

  Quack.utils.convertToQNT = function (quantity, decimals) {
    quantity = String(quantity);

    var parts = quantity.split(".");

    var qnt = parts[0];

    //no fractional part
    var i;
    if (parts.length == 1) {
      if (decimals) {
        for (i = 0; i < decimals; i++) {
          qnt += "0";
        }
      }
    } else if (parts.length == 2) {
      var fraction = parts[1];
      if (fraction.length > decimals) {
        throw $.t("error_fraction_decimals", {
          "decimals": decimals
        });
      } else if (fraction.length < decimals) {
        for (i = fraction.length; i < decimals; i++) {
          fraction += "0";
        }
      }
      qnt += fraction;
    } else {
      throw $.t("error_invalid_input");
    }

    //in case there's a comma or something else in there.. at this point there should only be numbers
    if (!/^\d+$/.test(qnt)) {
      throw $.t("error_invalid_input_numbers");
    }
    try {
      if (parseInt(qnt) === 0) {
        return "0";
      }
    } catch (e) {
    }

    //remove leading zeroes
    return qnt.replace(/^0+/, "");
  }

  Quack.utils.convertFromQNT = function (quantity, decimals) {
    var negative = "";
    var mantissa = "";

    if (typeof quantity != "object") {
      quantity = new BigInteger(String(quantity));
    }

    if (quantity.compareTo(BigInteger.ZERO) < 0) {
      quantity = quantity.abs();
      negative = "-";
    }

    var divider = new BigInteger("" + Math.pow(10, decimals));

    var fractionalPart = quantity.mod(divider).toString();
    quantity = quantity.divide(divider);

    if (fractionalPart && fractionalPart != "0") {
      mantissa = ".";

      for (var i = fractionalPart.length; i < decimals; i++) {
        mantissa += "0";
      }

      mantissa += fractionalPart.replace(/0+$/, "");
    }

    quantity = quantity.toString();
    return negative + quantity + mantissa;
  }

  //convert user amounts to amountQNT
  Quack.utils.updateQuantity = function(assets, callback) {

    var assetsSet = new Map();

    for(i = 0; i < assets.length; i++) {
      var asset = assets[i];
      var assetId = "NXT";
      var assetType = asset.type;
      if(assetType == "A") {
        assetId = "a:" + asset.id;
      } else if (assetType == "M") {
        assetId = "m:" + asset.id;
      }
      assetsSet.set(assetId, 1);
    }

    var allAssets = new Array();

    for (var key of assetsSet.keys()) {
      var asset = {};
      var sub = key.substring(0, 2);
      if(key == "NXT") {
        asset.id = "1";
        asset.type = "NXT"
      }

      if(sub == "a:") {
        asset.id = key.substring(2);
        asset.type = "A"
      } else if (sub == "m:") {
        asset.id = key.substring(2);
        asset.type = "M"
      }

      allAssets.push(asset);
    }

    //allAssets now contains only unique assetIds

    Quack.utils.getDecimals(allAssets, function(assetsState) {
      if(assetsState.ret == "ok") {

        for(i = 0; i < assetsState.state.length; i++) {
          var assetDecimalInfo = assetsState.state[i];
          var assetId = assetDecimalInfo.id;
          var decimals = assetDecimalInfo.decimals;
          var assetType = assetDecimalInfo.type;

          for(k = 0; k < assets.length; k++) {
            if(assetType == "NXT" && assets[k].type == "NXT") {
              assets[k].decimals = decimals;
              if(decimals >= 0) {
                var price = Quack.utils.convertToQNT(assets[k].QNTin, decimals);
                assets[k].QNTout = price;
              }
              continue;
            }

            if(assets[k].id != assetId) continue;
            if(assets[k].type != assetType) continue;
            assets[k].decimals = decimals;
            if(decimals >= 0) {
              var price = Quack.utils.convertToQNT(assets[k].QNTin, decimals);
              assets[k].QNTout = price;
            }
          }
        }

        callback({"ret":"ok", "state":assets});
      } else {
        callback(assetsState);
      }
    });
  }

  //convert amountQNT to user amounts
  Quack.utils.parseQuantity = function(assets, callback) {

    var assetsSet = new Map();

    for(i = 0; i < assets.length; i++) {
      var asset = assets[i];
      var assetId = "NXT";
      var assetType = asset.type;
      if(assetType == "A") {
        assetId = "a:" + asset.id;
      } else if (assetType == "M") {
        assetId = "m:" + asset.id;
      }
      assetsSet.set(assetId, 1);
    }

    var allAssets = new Array();

    for (var key of assetsSet.keys()) {
      var asset = {};
      var sub = key.substring(0, 2);
      if(key == "NXT") {
        asset.id = "1";
        asset.type = "NXT"
      }

      if(sub == "a:") {
        asset.id = key.substring(2);
        asset.type = "A"
      } else if (sub == "m:") {
        asset.id = key.substring(2);
        asset.type = "M"
      }

      allAssets.push(asset);
    }

    //allAssets now contains only unique assetIds

    Quack.utils.getDecimals(allAssets, function(assetsState) {
      if(assetsState.ret == "ok") {

        for(i = 0; i < assetsState.state.length; i++) {
          var assetDecimalInfo = assetsState.state[i];
          var assetId = assetDecimalInfo.id;
          var decimals = assetDecimalInfo.decimals;
          var assetType = assetDecimalInfo.type;

          for(k = 0; k < assets.length; k++) {
            if(assetType == "NXT" && assets[k].type == "NXT") {
              assets[k].decimals = decimals;
              if(decimals >= 0) {
                var price = new BigInteger(String(assets[k].QNTin));
                assets[k].QNTout = Quack.utils.convertFromQNT(price, decimals);
              }
              continue;
            }

            if(assets[k].id != assetId) continue;
            if(assets[k].type != assetType) continue;
            assets[k].decimals = decimals;
            if(decimals >= 0) {
              var price = new BigInteger(String(assets[k].QNTin));
              assets[k].QNTout = Quack.utils.convertFromQNT(price, decimals);
            }
          }
        }

        callback({"ret":"ok", "state":assets});
      } else {
        callback(assetsState);
      }
    });
  }

  //convert amountQNT to user amounts
  Quack.utils.scanHelper = function(account, timelimit, callback) {

    Quack.api.scan(account, timelimit, function(result) {
      if(result.ret == "ok") {

        var swaps = result.state.lookup;

        for (var key of swaps.keys()) {
          var swap = swaps.get(key);

          var assetsA = swap.assetsA;
          var assetsB = swap.assetsB;

          if(account == swap.recipient) {
            assetsA = swap.assetsB;
            assetsB = swap.assetsA;
          }

          swap.assetsA = assetsA;
          swap.assetsB = assetsB;

          result.state.lookup.set(key, swap);
        }
        callback(result);
      } else {
        callback(result);
      }
    });
  }

  ///HACK: only if used as plugin
  Quack.utils.simpleHash = function (b1, b2) {
    var sha256 = CryptoJS.algo.SHA256.create();
    sha256.update(converters.byteArrayToWordArray(b1));
    if (b2) {
      sha256.update(converters.byteArrayToWordArray(b2));
    }
    var hash = sha256.finalize();
    return converters.wordArrayToByteArrayImpl(hash, false);
  }

  Quack.utils.clientSignTx = function (requestType, data, callback, isAsync) {

    var type = "POST";
    var url = NRS.server + "/nxt?requestType=" + requestType;

    var secretPhrase = "";
    if (NRS.rememberPassword || data.broadcast == "true") {
      NRS.sendRequest(requestType, data, callback, isAsync);
      return;
    }

    if ((!NRS.isLocalHost || data.doNotSign) && type == "POST" && !NRS.isSubmitPassphrase(requestType)) {
      secretPhrase = data.secretPhrase;
      delete data.secretPhrase;
  
      if (NRS.accountInfo && NRS.accountInfo.publicKey) {
        data.publicKey = NRS.accountInfo.publicKey;
      } else if (!data.doNotSign && secretPhrase) {
        data.publicKey = NRS.generatePublicKey(secretPhrase);
        NRS.accountInfo.publicKey = data.publicKey;
      }
    }

    $.support.cors = true;
  
    var contentType;
    var processData;
    var formData = null;
    // JQuery defaults
    contentType = "application/x-www-form-urlencoded; charset=UTF-8";
    processData = true;

    $.ajax({
      url: url,
      crossDomain: true,
      dataType: "json",
      type: type,
      timeout: 30000,
      async: (isAsync === undefined ? true : isAsync),
      shouldRetry: (type == "GET" ? 2 : undefined),
      traditional: true,
      data: (formData != null ? formData : data),
      contentType: contentType,
      processData: processData
    }).done(function (response) {
      if (NRS.console) {
        NRS.addToConsole(this.url, this.type, this.data, response);
      }
   
      if (secretPhrase && response.unsignedTransactionBytes && !data.doNotSign && !response.errorCode && !response.error) {
        var signature = NRS.signBytes(response.unsignedTransactionBytes, converters.stringToHexString(secretPhrase));
        var sigBytes = converters.hexStringToByteArray(signature);
        var digestBytes = Quack.utils.simpleHash(sigBytes);

        var unBytes = converters.hexStringToByteArray(response.unsignedTransactionBytes);
        var fullHashBytes = Quack.utils.simpleHash(unBytes, digestBytes);
        var fullHash = converters.byteArrayToHexString(fullHashBytes);

        response.fullHash = fullHash;
        callback(response, data);

      } else {
        if (response.errorCode || response.errorDescription || response.errorMessage || response.error) {
          response.errorDescription = NRS.translateServerError(response);
          delete response.fullHash;
          if (!response.errorCode) {
            response.errorCode = -1;
          }
          callback(response, data);
        } else {
          callback(response, data);
        }
      }
    }).fail(function (xhr, textStatus, error) {
      if (NRS.console) {
        NRS.addToConsole(this.url, this.type, this.data, error, true);
      }

      if ((error == "error" || textStatus == "error") && (xhr.status == 404 || xhr.status == 0)) {
        if (type == "POST") {
          $.growl($.t("error_server_connect"), {
            "type": "danger",
            "offset": 10
          });
        }
      }

      if (error != "abort") {
        if (error == "timeout") {
          error = $.t("error_request_timeout");
        }
        callback({
          "errorCode": -1,
          "errorDescription": error
        }, {});
      }
    });
  }

  //private functions

  function queueReadyCallback(queue, length, callback) {
    if(queue.length >= length) {
      callback({"ret": "ok", "queue": queue});
    }
  }

  function queueReadyCallbackHash(queue, length, hash, callback) {
    if(queue.length >= length) {
      callback({"ret": "ok", "hash": hash, "queue": queue});
    }
  }

  function okReadyCallback(state, counter, callback) {
    if((counter.ok + counter.errors) >= counter.maxcount) {
      callback({"ret": "ok", "state": state});
    }
  }

  return Quack;
} (Quack || {}, jQuery));

//quack.api.js
var Quack = (function(Quack, $, undefined) {
  //Quack API
  Quack.api = {};

  ///HACK: account can be obtained with the secret but NXT plugin can give us account
  Quack.api.currentBlock = 0;
  //storage for swaps information
  Quack.api.swaps = new Map();

  ///------------- public functions

  //init call
  Quack.api.init = function(secret, recipientRS, finishHeight, assets, expectedAssets, privateMessage, callback) {

    var rest = finishHeight - Quack.api.currentBlock;
    var deadline = Math.floor(rest / 2);

    if (deadline < 3) {
      deadline = 3;
    }

    if ((deadline + 1) > rest)
    {
      callback({"ret": "error", "result": "Too short period until timeout"});
      return;
    }

    console.log("creating trigger tx");
    createtrigger(Quack.constants.triggerAccount, secret, 1440, Quack.constants.triggerFee, function(result) {

      if(result.fullHash) {

        var fullHash = result.fullHash;
        var unsignedBytes = result.unsignedTransactionBytes;
        var count = 0;
        var messageObject = {"quack": 1};
        var encryptedMessage = "";
        var txids = new Array();

        for (i = 0; i < assets.length; i++) {

          var asset = assets[i];

          if (count == 0)
          {
            messageObject = {
              "quack": 1,
              "recipient": recipientRS,
              "triggerBytes": unsignedBytes,
              "assets": assets,
              "expected_assets": expectedAssets

            };
            encryptedMessage = privateMessage;
          }

          var apiobject = {};
          var prunableEncrypted = false;
          if (Quack.constants.isTestnet) {
            prunableEncrypted = true;
          } else {
            if (Quack.api.currentBlock >= 621000) {
              prunableEncrypted = true;
            }
          }

          var hashArray = new Array();
          hashArray.push(fullHash);

          if (asset.type == "NXT") {
            apiobject = {
              "requestType": "sendMoney",
              "recipient": recipientRS,
              "secretPhrase": secret,
              "feeNQT": 0,
              "broadcast": "" + Quack.constants.broadcast,
              "deadline": "" + deadline,
              "amountNQT": "" + asset.QNT,
              "message": JSON.stringify(messageObject),
              "messageIsText": "true",
              "messageIsPrunable": "true",
              "messageToEncryptIsText": "true",
              "encryptedMessageIsPrunable": "" + prunableEncrypted,
              "phased": "true",
              "phasingFinishHeight": "" + finishHeight,
              "phasingVotingModel": "4",
              "phasingQuorum": "1",
              "phasingLinkedFullHash": hashArray
            };
          } else if (asset.type == "A") {
            apiobject = {
              "requestType": "transferAsset",
              "recipient": recipientRS,
              "secretPhrase": secret,
              "feeNQT": 0,
              "broadcast": "" + Quack.constants.broadcast,
              "deadline": "" + deadline,
              "asset": asset.id,
              "quantityQNT": "" + asset.QNT,
              "message": JSON.stringify(messageObject),
              "messageIsText": "true",
              "messageIsPrunable": "true",
              "messageToEncryptIsText": "true",
              "encryptedMessageIsPrunable": "" + prunableEncrypted,
              "phased": "true",
              "phasingFinishHeight": "" + finishHeight,
              "phasingVotingModel": "4",
              "phasingQuorum": "1",
              "phasingLinkedFullHash": hashArray
            };
          } else if (asset.type == "M") {
            apiobject = {
              "requestType": "transferCurrency",
              "recipient": recipientRS,
              "secretPhrase": secret,
              "feeNQT": 0,
              "broadcast": "" + Quack.constants.broadcast,
              "deadline": "" + deadline,
              "currency": asset.id,
              "units": "" + asset.QNT,
              "message": JSON.stringify(messageObject),
              "messageIsText": "true",
              "messageIsPrunable": "true",
              "messageToEncryptIsText": "true",
              "encryptedMessageIsPrunable": "" + prunableEncrypted,
              "phased": "true",
              "phasingFinishHeight": "" + finishHeight,
              "phasingVotingModel": "4",
              "phasingQuorum": "1",
              "phasingLinkedFullHash": hashArray
            };
          } else {
            console.log("undefined asset type: " + asset.type);
          }

          apiobject.phasingMinBalanceModel = "0";

          if(Quack.constants.isPlugin) {

            //encrypt message here to support client-side signing
            if(encryptedMessage && encryptedMessage.length > 0) {
              var options = {};
              options.account = recipientRS;

              var encrypted = NRS.encryptNote(encryptedMessage, options, NRS.rememberPassword? undefined : secret);
              apiobject.encryptedMessageData = encrypted.message;
              apiobject.encryptedMessageNonce = encrypted.nonce;
            }

            var requestType = apiobject.requestType;
            delete apiobject.requestType;
            apiobject.calculateFee = "" + !Quack.constants.broadcast;
            Quack.utils.clientSignTx(requestType, apiobject, function(txobject) {
              Quack.utils.txqueuedHash(txobject, txids, assets.length, fullHash, callback);
            });
          } else {
            apiobject.messageToEncrypt = encryptedMessage;
            $.post(Quack.constants.nxtApiUrl, apiobject,

              function(txobject) {
                Quack.utils.txqueuedHash(txobject, txids, assets.length, fullHash, callback);
              },
              "json"
            ).fail(function() {
              Quack.utils.txqueued({"error": "timeout"}, txids, assets.length, callback);
            });
          }

          count++;
        }
      }
      // if (!result.fullHash)
      else {
        callback({"ret": "error", "result": result});
      }

    });
  }

  //trigger call
  Quack.api.trigger = function(secret, triggerBytes, callback) {

    if(Quack.constants.isPlugin) {

      if(NRS.rememberPassword) {

        if(NRS.isLocalHost) {
          ///HACK: does not work on remote nodes
          NRS.sendRequest("signTransaction", {
            "unsignedTransactionBytes": triggerBytes,
            "secretPhrase": secret,
          },
          function(result) {

            var txBytes = result.transactionBytes;
            if (txBytes) {
              NRS.sendRequest("broadcastTransaction", {
                "transactionBytes": txBytes
              },

              function(result2) {

                var txid = result2.transaction;
                if (txid) {

                  console.log("Trigger txid: " + txid);
                  callback({"ret": "ok", "result": txid});

                } else {
                  Quack.utils.errored(callback, result2);
                }
              });

            } else {
              Quack.utils.errored(callback, result);
            }
          });
        } else {
          Quack.utils.errored(callback, "Cannot use saved password on remote hosts");
        }
      } else {

        var signature = NRS.signBytes(triggerBytes, converters.stringToHexString(secret));
        var payload = triggerBytes.substr(0, 192) + signature + triggerBytes.substr(320);
        var resp = {};
        resp.transactionJSON = {};      
        resp.transactionJSON.attachment = {};

        NRS.broadcastTransactionBytes(payload, function(result2) {
          var txid = result2.transaction;
          if (txid) {
            console.log("Trigger txid: " + txid);
            callback({"ret": "ok", "result": txid});
          } else {
            Quack.utils.errored(callback, result2);
          }
        }, resp, {});
      }
    } else {

      $.post(Quack.constants.nxtApiUrl, {
        "requestType": "signTransaction",
        "unsignedTransactionBytes": triggerBytes,
        "secretPhrase": secret
        },

        function(result) {

          var txBytes = result.transactionBytes;
          if (txBytes) {

            $.post(Quack.constants.nxtApiUrl, {
              "requestType": "broadcastTransaction",
              "transactionBytes": txBytes
              },

              function(result2) {

                var txid = result2.transaction;
                if (txid) {

                  console.log("Trigger txid: " + txid);
                  callback({"ret": "ok", "result": txid});

                } else {
                  Quack.utils.errored(callback, result2);
                }

              },
              "json"
            ).fail(function() { Quack.utils.failed(callback); });
          } else {
            Quack.utils.errored(callback, result);
          }

        },
        "json"
      ).fail(function() { Quack.utils.failed(callback); });
    }
  }

  //accept call
  Quack.api.accept = function(secret, recipientRS, finishHeight, assets, triggerHash, callback) {

    var rest = finishHeight - Quack.api.currentBlock;
    var deadline = Math.floor(rest / 2);

    if (deadline < 3) {
      deadline = 3;
    }

    if ((deadline + 1) > rest)
    {
      console.log("Too short period until timeout");
      callback({"ret": "error", "result": "Too short period until timeout"});
      return;
    }

    var messageJson = "{\"quack\":1}";
    var txids = new Array();
    var hashArray = new Array();
    hashArray.push(triggerHash);

    for (i = 0; i < assets.length; i++) {

      var asset = assets[i];
      var apiobject = {};

      if (asset.type == "NXT") {
        apiobject = {
          "requestType": "sendMoney",
          "recipient": recipientRS,
          "secretPhrase": secret,
          "feeNQT": 0,
          "broadcast": "" + Quack.constants.broadcast,
          "deadline": "" + deadline,
          "amountNQT": "" + asset.QNT,
          "message": messageJson,
          "messageIsText": "true",
          "messageIsPrunable": "true",
          "phased": "true",
          "phasingFinishHeight": "" + finishHeight,
           "phasingVotingModel": "4",
          "phasingQuorum": "1",
          "phasingLinkedFullHash": hashArray
        };
      } else if (asset.type == "A") {
        apiobject = {
          "requestType": "transferAsset",
          "recipient": recipientRS,
          "secretPhrase": secret,
          "feeNQT": 0,
          "broadcast": "" + Quack.constants.broadcast,
          "deadline": "" + deadline,
          "asset": asset.id,
          "quantityQNT": "" + asset.QNT,
          "message": messageJson,
          "messageIsText": "true",
          "messageIsPrunable": "true",
          "phased": "true",
          "phasingFinishHeight": "" + finishHeight,
          "phasingVotingModel": "4",
          "phasingQuorum": "1",
          "phasingLinkedFullHash": hashArray
        };
      } else if (asset.type == "M") {
        apiobject = {
          "requestType": "transferCurrency",
          "recipient": recipientRS,
          "secretPhrase": secret,
          "feeNQT": 0,
          "broadcast": "" + Quack.constants.broadcast,
          "deadline": "" + deadline,
          "currency": asset.id,
          "units": "" + asset.QNT,
          "message": messageJson,
          "messageIsText": "true",
          "messageIsPrunable": "true",
          "phased": "true",
          "phasingFinishHeight": "" + finishHeight,
          "phasingVotingModel": "4",
          "phasingQuorum": "1",
          "phasingLinkedFullHash": hashArray
        };
      } else {
        console.log("undefined asset type: " + asset.type);
      }

      apiobject.phasingMinBalanceModel = "0";

      if(Quack.constants.isPlugin) {
        var requestType = apiobject.requestType;
        delete apiobject.requestType;
        apiobject.calculateFee = "" + !Quack.constants.broadcast;
        Quack.utils.clientSignTx(requestType, apiobject, function(txobject) {
          Quack.utils.txqueued(txobject, txids, assets.length, callback);
        });
      } else {

        $.post(Quack.constants.nxtApiUrl, apiobject,

          function(txobject) {
            Quack.utils.txqueued(txobject, txids, assets.length, callback);
          },
          "json"
        ).fail(function() {
          Quack.utils.txqueued({"error": "timeout"}, txids, assets.length, callback);
        });
      }
    }
  }

  //scan call
  //account - what account to scan
  //timelimit - limit in seconds how old transactions do we scan
  //callback - returns {ret:ok, swaps:swaps} on success
  Quack.api.scan = function(account, timelimit, callback) {
    //create a hashmap of swap sessions with fullHash as a key
    var lookup = new Map();

    var timestamp = "" + 0;
    if ((Quack.utils.now() - timelimit) > 0) timestamp = "" + (Quack.utils.now() - timelimit);

    //get a list of transaction for account
    $.post(Quack.constants.nxtApiUrl, {
      "requestType": "getBlockchainTransactions",
      "account": account,
      "timestamp": timestamp,
      "phasedOnly": "true"
      },

      function(result) {

        var transactions = result.transactions;
        if (transactions) {
          //got transactions list for our account
          var length = transactions.length;
          var triggerDataTxs = new Array();
          var triggerIdsQueue = new Array();
          var counter = {"ok": 0, "errors": 0, "maxcount": 0};
          var state = {"lookup": lookup};

          for(i = 0; i < length; i++) {
            var tx = transactions[i];
            if(!tx) continue;
            var attach = tx.attachment;
            if(!attach) continue;
            var message = attach.message;
            if(!message) continue;
            var jsonMessage;
            try {
              jsonMessage = JSON.parse(message);
            } catch (e) {
              console.log("could not parse message. txid = " + tx.transaction);
            }
            if(!jsonMessage) continue;

            //filter quack transactions (quack: 1 in message)
            if(jsonMessage.quack != 1) continue;

            //got a quack message
            console.log("quack message id: " + tx.transaction);

            //for each phased transaction in txs check it's linkedFullHash and finishHeight
            var linkedhashes = attach.phasingLinkedFullHashes;
            if(!linkedhashes) continue;
            if(linkedhashes.length == 0) continue;

            var finishHeight = attach.phasingFinishHeight;
            if(!finishHeight) continue;
            if(finishHeight == 0) continue;

            var hashdata = linkedhashes[0];
            if(!hashdata) continue;

            var txSender = tx.senderRS;
            var txRecipient = tx.recipientRS;
            if(!txSender) continue;
            if(!txRecipient) continue;

            var txType = tx.type;
            var txSubtype = tx.subtype;

            //update swap information in map based on this info
            var swapInfo = lookup.get(hashdata);
            if (!swapInfo) {
              swapInfo = {};
              swapInfo.assetsA = new Array();
              swapInfo.assetsB = new Array();
              swapInfo.minFinishHeight = finishHeight;
              swapInfo.minFinishHeightA = finishHeight;
              swapInfo.minFinishHeightB = finishHeight;
              swapInfo.minConfirmationsA = tx.confirmations;
              swapInfo.minConfirmationsB = tx.confirmations;
            }

            if(finishHeight < swapInfo.minFinishHeight) swapInfo.minFinishHeight = finishHeight;

            //check for swap information available
            var triggerBytes = jsonMessage.triggerBytes;
            if(triggerBytes) {
              triggerDataTxs.push({"tx": tx, "hashdata": hashdata, "message": jsonMessage});
              swapInfo.tx = tx;
            }

            lookup.set(hashdata, swapInfo);

            $.ajax({
              url: Quack.constants.nxtApiUrl,
              dataType: "json",
              type: "POST",
              context:{"tx": tx},
              data: {
                "requestType": "getPhasingPoll",
                "transaction": tx.transaction,
                "countVotes": "true"
              }
            }).done(function (phasingResult) {
              var votes = phasingResult.result;
              var quorum = phasingResult.quorum;
              var approved = phasingResult.approved;

              if(approved) {
                votes = 1;
                quorum = 1;
              }

              if(phasingResult.transaction) {
                var txitem = this.tx;
                var attachItem = txitem.attachment;
                var hashitem = attachItem.phasingLinkedFullHashes[0];
                var finishHeightItem = attachItem.phasingFinishHeight;
                var swapInfo = lookup.get(hashitem);
                txitem.votes = votes;
                txitem.quorum = quorum;

                //check if it is payment
                if(txitem.type == 0 && txitem.subtype == 0) {
                  var assetInfo = {"id": 1, "type": "NXT", "QNT": txitem.amountNQT, "tx": txitem};
                  if(account == txitem.senderRS) {
                    swapInfo.assetsA.push(assetInfo);
                  } else {
                    swapInfo.assetsB.push(assetInfo);
                  }
                }
                //check if it is asset transfer
                else if (txitem.type == 2 && txitem.subtype == 1) {
                  var assetInfo = {"id": attachItem.asset, "type": "A", "QNT": attachItem.quantityQNT, "tx": txitem};
                  if(account == txitem.senderRS) {
                    swapInfo.assetsA.push(assetInfo);
                  } else {
                    swapInfo.assetsB.push(assetInfo);
                  }
                }
                //check if it is currency transfer
                else if (txitem.type == 5 && txitem.subtype == 3) {
                  var assetInfo = {"id": attachItem.currency, "type": "M", "QNT": attachItem.units, "tx": txitem};
                  if(account == txitem.senderRS) {
                    swapInfo.assetsA.push(assetInfo);
                  } else {
                    swapInfo.assetsB.push(assetInfo);
                  }
                } else {
                  Quack.utils.errored(callback, phasingResult);
                  return;
                }

                if(account == txitem.senderRS) {
                  if(finishHeightItem < swapInfo.minFinishHeightA) swapInfo.minFinishHeightA = finishHeightItem;
                  if(txitem.confirmations < swapInfo.minConfirmationsA) swapInfo.minConfirmationsA = txitem.confirmations;
                } else {
                  if(finishHeightItem < swapInfo.minFinishHeightB) swapInfo.minFinishHeightB = finishHeightItem;
                  if(txitem.confirmations < swapInfo.minConfirmationsB) swapInfo.minConfirmationsB = txitem.confirmations;
                }

                if(votes && quorum && votes == quorum) {
                  swapInfo.gotTrigger = true;
                }

                lookup.set(hashitem, swapInfo);
              } else {
                Quack.utils.errored(callback, phasingResult);
              }

            }).fail(function () {
              Quack.utils.errored(callback, phasingResult);
            });
          }

          counter.maxcount = triggerDataTxs.length;
          state.lookup = lookup;

          if(counter.maxcount > 0) {
            for(i = 0; i < counter.maxcount; i++) {
              var hashdata = triggerDataTxs[i].hashdata;
              var message = triggerDataTxs[i].message;
              var txSender = triggerDataTxs[i].tx.senderRS;

              tryUpdateInformation(state, counter, account, txSender, hashdata, message, callback);
            }
          } else {
            callback({"ret": "ok", "state": state});
          }

        } else {
          Quack.utils.errored(callback, result);
        }
      },
      "json"
    ).fail(function() { Quack.utils.failed(callback); });
  }

  ///------------- private functions

  function createtrigger(account, secret, deadline, fee, callback) {
    var messageJson = "{\"quack\":1,\"trigger\":1}";

    if(Quack.constants.isPlugin) {
      Quack.utils.clientSignTx("sendMoney", {
        "recipient": account,
        "secretPhrase": secret,
        "feeNQT": 0,
        "broadcast": "false",
        "deadline": "" + deadline,
        "amountNQT": "" + fee,
        "message": messageJson,
        "messageIsText": "true",
        "messageIsPrunable": "false",
        "calculateFee": "true"
        },
        function(result) {
          callback(result);
        });
    } else {
      $.post(Quack.constants.nxtApiUrl, {
        "requestType": "sendMoney",
        "recipient": account,
        "secretPhrase": secret,
        "feeNQT": 0,
        "broadcast": "false",
        "deadline": "" + deadline,
        "amountNQT": "" + fee,
        "message": messageJson,
        "messageIsText": "true",
        "messageIsPrunable": "false"
        },

        function(result) {
          callback(result);
        },
        "json"
      ).fail(function() { Quack.utils.failed(callback); });
    }
  }

  function tryUpdateInformation(state, counter, account, sender, hashdata, message, callback) {
    var swapInfo = state.lookup.get(hashdata);
    if(swapInfo.assets && swapInfo.assets.length > 0 && txSender != account) {
      Quack.utils.txok(state, counter, "error", callback);
      return;
    }

    if(!message) {
      Quack.utils.txok(state, counter, "error", callback);
      return;
    }

    //parse trigger bytes to get swap data
    $.post(Quack.constants.nxtApiUrl, {
      "requestType": "parseTransaction",
      "transactionBytes": message.triggerBytes
      },

      function(tx) {
        if(tx.amountNQT) {
          var payment = tx.amountNQT;
          var feeRecipient = tx.recipientRS;
          var sender = tx.senderRS;
          var recipient = message.recipient;

          //check fee recipient and amount
          if(payment < Quack.constants.triggerFee) {
            Quack.utils.txok(state, counter, "error", callback);
            return;
          }

          if(feeRecipient != Quack.constants.triggerAccount) {
            Quack.utils.txok(state, counter, "error", callback);
            return;
          }

          swapInfo.sender = sender;
          swapInfo.recipient = recipient;
          swapInfo.triggerBytes = message.triggerBytes;
          swapInfo.assets = message.assets;
          swapInfo.expectedAssets = message.expected_assets;
          state.lookup.set(hashdata, swapInfo);

          Quack.utils.txok(state, counter, "ok", callback);
        } else {
          Quack.utils.txok(state, counter, "error", callback);
        }
      },
      "json"
    ).fail(function() {
      Quack.utils.txok(state, counter, "error", callback);
    });


  }

  return Quack;
} (Quack || {}, jQuery));

var submitProgress = function(modal) {
  var btn = modal.find("button.btn-primary:not([data-dismiss=modal])");
  modal.find("button").prop("disabled", true);
}

var submitOk = function(modal) {
  modal.find("button").prop("disabled", false);
  modal.modal("hide");
}

var submitFailed = function(modal, response) {
  modal.find(".error_message").html(response).show();
  modal.find("button").prop("disabled", false);
}

var updateCreateFee = function() {
  var singleFee = 2;
  var tippingFee = 3.5;

  if(Quack.constants.isTestnet || NRS.lastBlockHeight >= 621000) {
    singleFee = 3;
  }

  var rows = 0;
  $(".quackForm .s tbody tr").each(function(i){
    rows++;
  });
  var fee = rows * singleFee;

  var modal = $("#quackCreateModal");
  modal.find("#quack_create_fee2").html("" + fee + " NXT" + " (+" + tippingFee + " NXT)");
}

var updateAcceptFee = function(rows) {
  var singleFee = 2;
  var tippingFee = 3.5;

  if(Quack.constants.isTestnet || NRS.lastBlockHeight >= 621000) {
    singleFee = 3;
  }

  var fee = rows * singleFee;

  var modal = $("#quackAcceptModal");
  modal.find("#quack_create_fee3").html("" + fee + " NXT");
}

var updateFinalizeFee = function(rows) {
  var tippingFee = 3.5;

  var modal = $("#quackFinalizeModal");
  modal.find("#quack_create_fee4").html("" + tippingFee + " NXT");
}

$(".quackAddRow").click(function(){

    //check if send or recieve form
    var prefix = "s";
    if ($(this).hasClass("r")) prefix = "r";

    //select and clone first row
    var row = $(".quackForm ." + prefix + " tbody tr:first").clone(true);
    //remove plus button
    row.find(".quackAddRow").remove();
    //show minus button
    row.find(".quackRemoveRow").show();
    //set defaults for new row
    row.find(".assetQuantity").val("");
    row.find(".assetIdA").val("");
    row.find(".assetIdM").val("");
    row.find(".assetType option").removeAttr("selected");
    row.find(".assetTypeA").hide();
    row.find(".assetTypeM").hide();
    // finalize html
    $('<tr>').append(row.html());
    //add new row after last one
    $(".quackForm ." + prefix + " tr:last").after(row);
    var rows = 0;

    $(".quackForm ." + prefix + " tbody tr").each(function(i){
        // Add index class to every row
        $(this).removeClass().addClass(prefix + i);
        // Add ID to every asset type
        $(this).find(".assetType select").attr("id", prefix + i);
        // Add tab indexes
        if (prefix == "s") {
          var step = 100 + i * 10;
          $(this).find(".assetType select").attr("tabindex", step + 1);
          $(this).find(".assetIdA").attr("tabindex", step + 2);
          $(this).find(".assetIdM").attr("tabindex", step + 3);
          $(this).find(".assetQuantity").attr("tabindex", step + 4);
          rows++;
        } else {
          var step = 500 + i * 10;
          $(this).find(".assetType select").attr("tabindex", step + 1);
          $(this).find(".assetIdA").attr("tabindex", step + 2);
          $(this).find(".assetIdM").attr("tabindex", step + 3);
          $(this).find(".assetQuantity").attr("tabindex", step + 4);
        }
    });

    updateCreateFee();
});

$(".quackRemoveRow").click(function(){

    //check if send or recieve form
    var prefix = "s";
    if ($(this).hasClass("r")) prefix = "r";

    //remove row
    $(this).parent().parent("tr").remove();

    $(".quackForm ." + prefix + " tbody tr").each(function(i){
        // Reindex rows
        $(this).removeClass().addClass(prefix + i);
        // Reindex asset types
        $(this).find(".assetType select").attr("id", prefix + i);
    });

   updateCreateFee();
});

$(".quackForm .assetType select").on("change", function () {

    var type = $(this).val();
    var id = $(this).attr("id");

    if(type == "NXT") {
      $("tr." + id).find(".assetTypeA").hide();
      $("tr." + id).find(".assetTypeM").hide();
    } else if (type == "A") {
      $("tr." + id).find(".assetTypeA").show();
      $("tr." + id).find(".assetTypeM").hide();
    } else if (type == "M") {
      $("tr." + id).find(".assetTypeA").hide();
      $("tr." + id).find(".assetTypeM").show();
    }
});

$("#quackCreateModal").on("show.bs.modal", function () {
      //mask all account fields
      var $inputFields = $(this).find("input[name=recipient]").not("[type=hidden]");
      $.each($inputFields, function() {
        if ($(this).hasClass("noMask")) {
          $(this).mask("NXT-****-****-****-*****", {
            "noMask": true
          }).removeClass("noMask");
        } else {
          $(this).mask("NXT-****-****-****-*****");
        }
      });

     updateCreateFee();
});

//add optional message
$("#quack_create_add_message").on("click", function () {

  if ($("#quack_create_add_message").is(":checked")) {
      $("#quackCreateModal").find(".optional_message").show();
  } else {
      $("#quackCreateModal").find(".optional_message").hide();
  }
});

//Reset form to initial state when modal is closed
$(".modal").on("hidden.bs.modal", function() {
    $(this).find("input[name=recipient]").not("[type=hidden]").trigger("unmask");
    $(this).find(":input:not(button)").each(function() {
      var defaultValue = $(this).data("default");
      var type = $(this).attr("type");
      var tag = $(this).prop("tagName").toLowerCase();
      if (type == "checkbox") {
        if (defaultValue == "checked") {
          $(this).prop("checked", true);
        } else {
          $(this).prop("checked", false);
        }
      } else if (type == "hidden") {
        if (defaultValue !== undefined) {
          $(this).val(defaultValue);
        }
      } else if (tag == "select") {
        if (defaultValue !== undefined) {
          $(this).val(defaultValue);
        } else {
          $(this).find("option:selected").prop("selected", false);
          $(this).find("option:first").prop("selected", "selected");
        }
      } else {
        if (defaultValue !== undefined) {
          $(this).val(defaultValue);
        } else {
          $(this).val("");
        }
      }

      //remove all Send rows but first
      $(".quackForm .s tbody tr").each(function(i){
          if (i > 0) $(this).remove();
      });

      //remove all Recieve rows but first
      $(".quackForm .r tbody tr").each(function(i){
          if (i > 0) $(this).remove();
      });

      //hide all asset type IDs
      $(".quackForm tbody tr").each(function(i){
          $(this).find(".assetTypeA").hide();
          $(this).find(".assetTypeM").hide();
      });

    });

    //Hidden form field
    $(this).find("input[name=converted_account_id]").val("");

    //Hide/Reset any possible error messages
    $(this).find(".callout-danger:not(.never_hide), .error_message, .account_info").html("").hide();
    $(this).find(".advanced").hide();
});

$("#quackDetailsModal").on("show.bs.modal", function () {

      var modal = $("#quackDetailsModal");
      var key = modal.attr("extra");
      var swap = Quack.api.swaps.get(key);

      loadDetails(swap, function(sentRows, expectedRows) {
        var el = $("#quackSendAssetsTable");
        el.find("tbody").empty().append(sentRows);
        el = $("#quackReceiveAssetsTable");
        el.find("tbody").empty().append(expectedRows);
      });
});

$("#quackAcceptModal").on("show.bs.modal", function () {

      var modal = $("#quackAcceptModal");
      var key = modal.attr("extra");
      var swap = Quack.api.swaps.get(key);

      var rows = 0;
      loadDetails(swap, function(sentRows, expectedRows) {
        var el = $("#quackAcceptSendAssetsTable");
        el.find("tbody").empty().append(sentRows);
        el = $("#quackAcceptReceiveAssetsTable");
        el.find("tbody").empty().append(expectedRows);
      });

      updateAcceptFee(swap.expectedAssets.length);
});

$("#quackFinalizeModal").on("show.bs.modal", function () {

      var modal = $("#quackFinalizeModal");
      var key = modal.attr("extra");
      var swap = Quack.api.swaps.get(key);

      loadDetails(swap, function(sentRows, expectedRows) {
        var el = $("#quackFinalizeSendAssetsTable");
        el.find("tbody").empty().append(sentRows);
        el = $("#quackFinalizeReceiveAssetsTable");
        el.find("tbody").empty().append(expectedRows);
      });

      updateFinalizeFee();
});

function loadDetails(swap, callback) {

      var sentRows = "";
      var expectedRows = "";

      var allAssets = new Array();
      for(i = 0; i < swap.assets.length; i++) {
        var asset = swap.assets[i];
        asset.reftype = "assets";
        asset.QNTin = asset.QNT;
        allAssets.push(asset);
      }
      for(i = 0; i < swap.expectedAssets.length; i++) {
        var asset = swap.expectedAssets[i];
        asset.reftype = "expectedAssets";
        asset.QNTin = asset.QNT;
        allAssets.push(asset);
      }

      //calculate user quantities
      Quack.utils.parseQuantity(allAssets, function(assetsState) {
        if(assetsState.ret == "ok") {

          var status = "Unknown";
          var confirmations = 0;

          for(i = 0; i < assetsState.state.length; i++) {
            var asset2 = assetsState.state[i];

            //set default Icons
            var statusIcon = "fa-circle-o";
            var typeIcon = "fa-circle-o";

            //show asset type
            var assetType = asset2.type;
            if (assetType == "A") {
              assetType = "Asset";
              typeIcon = "fa-signal";
            } else if (assetType == "M") {
              assetType = "Currency";
              typeIcon = "fa-bank";
            } else {
              assetType = "NXT";
              typeIcon = "fa-money";
            }

            var assetId = asset2.id;
            var assetIdLink =  "<a href=\"#\" class=\"show_transaction_modal_action\" data-transaction=\"" + assetId + "\">" + assetId + "</a>";
            if (asset2.type == "NXT") {
              assetId = "1";
              assetIdLink = "NXT";
            }

            var checkAssets = swap.assetsA;
            if(asset2.reftype == "expectedAssets") {
              checkAssets = swap.assetsB;
            }

            //take actual confirmations and finishHeight from blockchain
            asset2.tx = {finishHeight: 0, confirmations: 0};
            asset2.status = "Unconfirmed";
            for(j = 0; j < checkAssets.length; j++) {
              var checkAsset = checkAssets[j];
              if(checkAsset.type != asset2.type) continue;
              if(checkAsset.id != asset2.id) continue;
              if(checkAsset.QNT < asset2.QNT) continue;
              if(!checkAsset.tx.attachment) continue;
              if(!checkAsset.tx.attachment.phasingFinishHeight) continue;

              asset2.tx = checkAsset.tx;
              asset2.tx.finishHeight = checkAsset.tx.attachment.phasingFinishHeight;
              asset2.status = "OK";
              statusIcon = "fa-check";
            }

            var row =
              "<tr>" +
                "<td class=\"id\">" + assetIdLink + "</td>" +
                "<td class=\"type\"><i class=\"fa " + typeIcon + "\" title=\"" + assetType + "\"</td>" +
                "<td class=\"quantity\">" + asset2.QNTout + "</td>" +
                "<td class=\"confirms\">" + asset2.tx.confirmations + "</td>" +
                "<td class=\"status\"><i class=\"fa " + statusIcon + "\" title=\"" + asset2.status + "\"></i></td>" +
                "</tr>";

            if(asset2.reftype == "assets") {
              sentRows += row;
            } else if (asset2.reftype == "expectedAssets") {
              expectedRows += row;
            }
          }

          callback(sentRows, expectedRows);
        } else {
          callback(sentRows, expectedRows);
        }
      });
}

function pageLoading() {
      var $el = $("#quackHistoryTable");
      var $parent = $el.parent();
      $parent.addClass("data-loading");
      $("#quackHistoryError").hide();
}

function dataLoaded(data) {
      var $el = $("#quackHistoryTable");
      $el.find("tbody").empty().append(data);

      dataLoadFinished($el);
}

function dataLoadFinished($el, fadeIn) {
      var $parent = $el.parent();

      if (fadeIn) {
        $parent.hide();
      }

      $parent.removeClass("data-loading");
      $el.show();
}

function submitQuackCreate() {
      var modal = $("#quackCreateModal");
      var account = $("#quackMainAccount").val();
      submitProgress(modal);

      var recipientRS = modal.find("#quackCreateRecipient").val();
      var secret = modal.find("#quackCreatePassword").val();
      var assets = new Array();
      var expectedAssets = new Array();
      var privateMessage = modal.find("#quack_create_message").val();
      var usePrivateMessage = modal.find("#quack_create_add_message").prop("checked");
      if(!usePrivateMessage) privateMessage = "";

      if(!recipientRS) {
        submitFailed(modal, "Recipient not set");
        return;
      }

      if(!Quack.constants.isPlugin || !NRS.rememberPassword) {
        if(!secret) {
          submitFailed(modal, "Secret phrase not set");
          return;
        }
      }

      var prefix = "s";
      $(".quackForm ." + prefix + " tbody tr").each(function(i) {
        var as = $(this).find(".assetType select");
        var assetType = as.val();
        var assetId = 0;
        if(assetType == "NXT") {
          assetId = "1";
        } else if(assetType == "A") {
          assetId = $(this).find(".assetIdA").val();
        } else if(assetType == "M") {
          assetId = $(this).find(".assetIdM").val();
        }

        if(!assetId) {
          submitFailed(modal, "Asset ID not set");
          return;
        }

        var assetQNT = $(this).find(".assetQuantity").val();

        if(!assetQNT || assetQNT <= 0) {
          submitFailed(modal, "Quantity not set");
          return;
        }

        assets.push({
          "id":assetId,
          "QNT":assetQNT,
          "type":assetType
        });

      });

      prefix = "r";
      $(".quackForm ." + prefix + " tbody tr").each(function(i) {
        var as = $(this).find(".assetType select");
        var assetType = as.val();
        var assetId = 0;
        if(assetType == "NXT") {
          assetId = "1";
        } else if(assetType == "A") {
          assetId = $(this).find(".assetIdA").val();
        } else if(assetType == "M") {
          assetId = $(this).find(".assetIdM").val();
        }

        if(!assetId) {
          submitFailed(modal, "Asset ID not set");
          return;
        }

        var assetQNT = $(this).find(".assetQuantity").val();

        if(!assetQNT || assetQNT <= 0) {
          submitFailed(modal, "Quantity not set");
          return;
        }

        if(assetQNT) {
          expectedAssets.push({
            "id":assetId,
            "QNT":assetQNT,
            "type":assetType
          });
        }

      });

      var allAssets = new Array();
      for(i = 0; i < assets.length; i++) {
        var asset = assets[i];
        asset.reftype = "assets";
        asset.QNTin = asset.QNT;
        allAssets.push(asset);
      }
      for(i = 0; i < expectedAssets.length; i++) {
        var asset = expectedAssets[i];
        asset.reftype = "expectedAssets";
        asset.QNTin = asset.QNT;
        allAssets.push(asset);
      }

      $.post(Quack.constants.nxtApiUrl, {
        "requestType": "getBlockchainStatus"
        },

        function(status) {

          var currentBlock = status.numberOfBlocks;

          if(currentBlock) {
            var finishHeight = currentBlock + Quack.constants.swapBlocks;

            Quack.utils.updateQuantity(allAssets, function(assetsState) {
              if(assetsState.ret == "ok") {

                var assetsWithQNT = new Array();
                var expectedAssetsWithQNT = new Array();
                for(i = 0; i < assetsState.state.length; i++) {
                  if(assetsState.state[i].decimals < 0) {
                    submitFailed(modal, "Incorrect Asset Id: " + assetsState.state[i].id);
                    return;
                  }
                  var asset = assetsState.state[i];
                  asset.QNT = asset.QNTout;
                  delete asset.decimals;
                  delete asset.QNTin;
                  delete asset.QNTout;

                  if(asset.reftype == "assets") {
                    delete asset.reftype;
                    assetsWithQNT.push(asset);
                  } else if (asset.reftype == "expectedAssets") {
                    delete asset.reftype;
                    expectedAssetsWithQNT.push(asset);
                  }
                }

                Quack.api.currentBlock = currentBlock;
                Quack.api.init(secret, recipientRS, finishHeight, assetsWithQNT, expectedAssetsWithQNT, privateMessage, function(result) {

                  if(result.ret == "ok") {

                    var ids = result.queue;
                    var queueOk = false;
                    var errorNum = -1;
                    if(ids) {
                      for(k = 0; k < ids.length; k++) {
                        if (!ids[k]) continue;
                        if (ids[k] == "") continue;
                        if (ids[k] == "0") continue;
                        if (ids[k].ret == "error") {
                          if (errorNum < 0) errorNum = k;
                          continue;
                        }
                        queueOk = true;
                      }
                    }

                    if (queueOk) {
                      if(errorNum < 0) {
                        var hash = result.hash;
                        var swap = Quack.api.swaps.get(hash);
                        if(!swap && ids.length > 0) {
                          swap = {};
                          swap.sender = account;
                          swap.recipient = recipientRS;
                          swap.assets = assets;
                          swap.expectedAssets = expectedAssets;
                          swap.assetsA = new Array();
                          swap.assetsB = new Array();
                          swap.minFinishHeight = ids[0].tx.transactionJSON.attachment.phasingFinishHeight;
                          swap.minFinishHeightA = swap.minFinishHeight;
                          swap.minFinishHeightB = swap.minFinishHeight;
                          swap.minConfirmationsA = swap.minFinishHeight;
                          swap.minConfirmationsB = swap.minFinishHeight;
                          swap.tx = ids[0].tx;
                          swap.tx.timestamp = ids[0].tx.transactionJSON.timestamp;
                          Quack.api.swaps.set(hash, swap);
                        }
                        submitOk(modal);
                        quackScan();
                        $.growl("Quack created successfully", {"type": "success"});
                      } else {
                        submitFailed(modal, "Quack Create partially failed (" + JSON.stringify(ids[errorNum].result) + ")");
                      }
                    } else {
                      if(ids && ids.length > 0) {
                        submitFailed(modal, "Quack Create failed (" + JSON.stringify(ids[0].result) + ")");
                      } else {
                        submitFailed(modal, "Quack Create failed. No response from NRS.");
                      }
                    }

                  }
                  else {
                    console.log("result = " + JSON.stringify(result.result));
                    submitFailed(modal, "Quack Create failed (" + JSON.stringify(result.result) + ")");
                  }
                });
              } else {
                submitFailed(modal, "NRS problem occured");
              }
            });
          }
        },
        "json"
      ).fail(function() {
        submitFailed(modal, "NRS problem occured");
      });
}

function submitQuackAccept() {
      var modal = $("#quackAcceptModal");
      submitProgress(modal);

      var key = modal.attr("extra");
      var swap = Quack.api.swaps.get(key);
      var assets = swap.expectedAssets;
      var secret = modal.find("#quackAcceptPassword").val();

      if(!Quack.constants.isPlugin || !NRS.rememberPassword) {
        if(!secret) {
          submitFailed(modal, "Secret phrase not set");
          return;
        }
      }

      $.post(Quack.constants.nxtApiUrl, {
        "requestType": "getBlockchainStatus"
        },

        function(status) {

          var currentBlock = status.numberOfBlocks;
          var finishHeight = swap.minFinishHeight;
          var triggerHash = key;

          if(currentBlock) {

            Quack.api.currentBlock = currentBlock;
            Quack.api.accept(secret, swap.sender, finishHeight, assets, triggerHash, function(result) {

              if(result.ret == "ok") {

                var ids = result.queue;
                var queueOk = false;
                var errorNum = -1;
                if(ids) {
                  for(k = 0; k < ids.length; k++) {
                    if (!ids[k]) continue;
                    if (ids[k] == "") continue;
                    if (ids[k] == "0") continue;
                    if (ids[k].ret == "error") {
                      if (errorNum < 0) errorNum = k;
                      continue;
                    }
                    queueOk = true;
                  }
                }

                if (queueOk) {
                  if(errorNum < 0) {
                    swap.accepting = true;
                    Quack.api.swaps.set(key, swap);
                    submitOk(modal);
                    quackScan();
                    $.growl("Quack accepted successfully", {"type": "success"});
                  } else {
                    submitFailed(modal, "Quack Accept partially failed (" + JSON.stringify(ids[errorNum].result) + ")");
                  }
                }else {
                  if(ids && ids.length > 0) {
                    submitFailed(modal, "Quack Accept failed (" + JSON.stringify(ids[0].result) + ")");
                  } else {
                    submitFailed(modal, "Quack Accept failed. No response from NRS.");
                  }
                }

              }
              else {
                console.log("result = " + JSON.stringify(result.result));
                submitFailed(modal, "Quack Accept failed (" + JSON.stringify(result.result) + ")");
              }

            });
          } else {
            submitFailed(modal, "NRS problem occured");
          }
        },
        "json"
      ).fail(function() {
        submitFailed(modal, "NRS problem occured");
      });
}

function submitQuackTrigger() {
      var modal = $("#quackFinalizeModal");
      submitProgress(modal);

      var key = modal.attr("extra");
      var swap = Quack.api.swaps.get(key);
      var assets = swap.expectedAssets;
      var secret = modal.find("#quackFinalizePassword").val();

      if(!Quack.constants.isPlugin || !NRS.rememberPassword) {
        if(!secret) {
          submitFailed(modal, "Secret phrase not set");
          return;
        }
      }

      $.post(Quack.constants.nxtApiUrl, {
        "requestType": "getBlockchainStatus"
        },

        function(status) {

          var currentBlock = status.numberOfBlocks;
          var finishHeight = swap.minFinishHeight;
          var triggerBytes = swap.triggerBytes;

          ///TODO: check finish height one more time

          if(currentBlock) {

            Quack.api.currentBlock = currentBlock;
            Quack.api.trigger(secret, triggerBytes, function(result)  {

              if(result.ret == "ok") {

                var id = result.result;

                if (id && id != "" && id != "0") {
                  swap.finalizing = true;
                  Quack.api.swaps.set(key, swap);
                  submitOk(modal);
                  quackScan();
                  $.growl("Quack accepted successfully", {"type": "success"});
                } else {
                  submitFailed(modal, "Quack Trigger failed (" + JSON.stringify(result) + ")");
                }

              }
              else {
                submitFailed(modal, "Quack Trigger failed (" + JSON.stringify(result.result) + ")");
              }

            });
          } else {
            submitFailed(modal, "NRS problem occured (" + JSON.stringify(status) + ")");
          }
        },
        "json"
      ).fail(function() {
        submitFailed(modal, "NRS problem occured");
      });
}

function quackScan() {
      var rows = "";
      var account = $("#quackMainAccount").val();
      var timelimit = 60 * 60 * 24 * 14;

      pageLoading();

      $.post(Quack.constants.nxtApiUrl, {
        "requestType": "getBlockchainStatus"
        },

        function(status) {

          var currentBlock = status.numberOfBlocks;

          if(currentBlock) {
            $("#quackCurrentHeight").html(currentBlock);
            Quack.api.currentBlock = currentBlock;
            Quack.utils.scanHelper(account, timelimit, function(result) {

              if(result.ret == "ok") {

                var swaps = result.state.lookup;
                for (var key of Quack.api.swaps.keys()) {
                  var swap = Quack.api.swaps.get(key);
                  var newswap = swaps.get(key);
                  if(newswap) {
                    newswap.accepting = swap.accepting;
                    newswap.finalizing = swap.finalizing;
                    swaps.set(key, newswap);
                  } else {
                    swaps.set(key, swap);
                  }
                }

                Quack.api.swaps = swaps;

                var status = "Unknown";
                var items = new Array();
                for (var key of swaps.keys()) {
                  var swap = swaps.get(key);
                  var item = {};
                  item.hash = key;
                  item.data = swap;
                  item.timestamp = swap.tx.timestamp;
                  items.push(item);
                }

                items.sort(function(a, b) {
                  return b.timestamp - a.timestamp;
                });        

                for (var i = 0; i < items.length; i++) {
                  var swap = items[i].data;

                  //display own Account Name as You
                  var accSender = swap.sender;
                  var accRecipient = swap.recipient;
                  if(account == swap.sender) {
                      accSender = "You";
                  } else {
                      accRecipient = "You";
                  }

                  //set Status Button defaults
                  statusColor = "btn-warning";
                  statusIcon = "fa-circle-o";
                  clickAction = "quackSwapDetails(this);"

                  if(swap.gotTrigger) {
                    status = "Done";
                    statusColor = "btn-success";
                    statusIcon = "fa-check";
                  } else {
                    //show Expired status for B earlier since A should have time to finalize it
                    var limitBlocks = Quack.constants.defaultConfirmations;
                    if(account == swap.recipient) {
                      limitBlocks = Quack.constants.defaultConfirmations * 2;
                    }
                    if(swap.minFinishHeight < (currentBlock + limitBlocks)) {
                      status = "Expired";
                      statusColor = "btn-danger";
                      statusIcon = "fa-clock-o";
                    } else {
                      status = quackGetStatus(account, swap);
                    }
                  }

                  if(status == "Invalid") {
                    statusColor = "btn-danger";
                    statusIcon = "fa-circle-o";
                  }

                  if(status == "Valid") {

                      if (account == swap.sender) {
                        if(swap.finalizing) {
                          status = "Accepting";
                        } else {
                          statusColor = "btn-primary";
                          statusIcon = "fa-check-circle";
                          clickAction = "quackSwapTrigger(this);";
                          status = "Accept";
                        }
                      } else {
                        status = "Pending";
                      }

                  } else if(status == "PendingB") {

                      if (account == swap.recipient) {
                        if(swap.accepting) {
                          status = "Accepting";
                        } else {
                          statusColor = "btn-primary";
                          statusIcon = "fa-check-circle";
                          clickAction = "quackSwapAccept(this);";
                          status = "Accept";
                        }
                      } else {
                        status = "Pending";
                      }
                  } else if(status == "PendingA") {
                    status = "Pending";
                  }else if(status == "UnconfirmedA") {
                    status = "Pending";
                  } else if(status == "UnconfirmedB") {
                    status = "Pending";
                  }

                  //get Date/Time of the first transaction of Swap
                  var startTimestamp = swap.tx.timestamp;
                  var startDate = Quack.utils.txTime(startTimestamp);
                  var startTransaction = swap.tx.transaction;

                  //get Asset Types for Swap Type column
                  var assetTypeA = "empty";
                  if (swap.assets[0]) {
                    assetTypeA = swap.assets[0].type;
                  }

                  if(swap.assets.length > 1) {
                    assetTypeA = "X";
                  }

                  if(assetTypeA != "A" && assetTypeA != "M" && assetTypeA != "X" && assetTypeA != "NXT") {
                    assetTypeA = "empty";
                  }

                  var assetTypeB = "empty";
                  if (swap.expectedAssets[0]) {
                    assetTypeB = swap.expectedAssets[0].type;
                  }

                  if(swap.expectedAssets.length > 1) {
                    assetTypeB = "X";
                  }

                  if(assetTypeB != "A" && assetTypeB != "M" && assetTypeB != "X" && assetTypeB != "NXT") {
                    assetTypeB = "empty";
                  }

                  //set Type Icons
                  var typeIcon = [];

                  typeIcon["empty"] = [];
                  typeIcon["empty"]["icon"] = "fa-circle-o";
                  typeIcon["empty"]["info"] = "Nothing";

                  typeIcon["A"] = [];
                  typeIcon["A"]["icon"] = "fa-signal";
                  typeIcon["A"]["info"] = "Asset";

                  typeIcon["M"] = [];
                  typeIcon["M"]["icon"] = "fa-bank";
                  typeIcon["M"]["info"] = "Currency";

                  typeIcon["NXT"] = [];
                  typeIcon["NXT"]["icon"] = "fa-money";
                  typeIcon["NXT"]["info"] = "NXT";

                  typeIcon["X"] = [];
                  typeIcon["X"]["icon"] = "fa-th-large";
                  typeIcon["X"]["info"] = "Multiple";

                  rows += '<tr>' +
                    // Started
                    '<td><a class="show_transaction_modal_action" href="#" data-timestamp="' + startTimestamp + '" data-transaction="' + startTransaction + '">' + startDate + '</a></td>' +
                    // Finish Heigth
                    '<td>' + swap.minFinishHeight + '</td>' +
                    // Swap Type
                    '<td>' + '<a class="label label-primary" href="#" extra="' + items[i].hash + '" onclick="quackSwapDetails(this);">' +
                             '<i class="fa ' + typeIcon[assetTypeA]["icon"] + '"></i>&nbsp; <i class="ion-arrow-swap"></i>&nbsp; <i class="fa ' + typeIcon[assetTypeB]["icon"] + '"></i></a>&nbsp;' +
                             '<span class="swapTypeInfo">' + typeIcon[assetTypeA]["info"] + ' to ' + typeIcon[assetTypeB]["info"] + '</span></td>' +
                    // Sender
                    '<td><a href="#" data-user="' + swap.sender + '" class="show_account_modal_action user-info">' + accSender + '</a></td>' +
                    // Recipient
                    '<td><a href="#" data-user="' + swap.recipient + '" class="show_account_modal_action user-info">' + accRecipient + '</a></td>' +
                    // Status
                    "<td><button type=\"button\" class=\"btn btn-xs " + statusColor +
                                "\" onclick=\"" + clickAction +
                                "\" extra=\"" + items[i].hash +
                                "\"><i class=\"fa " + statusIcon +
                                "\"></i>&nbsp; " + status + "</button></td>" +
                    "</tr>";

                }

                if (rows.length == 0) {
                  $("#quackHistoryError").html("No Quack history available.").show();
                }
                dataLoaded(rows);
              } else {
                $("#quackHistoryError").html("Error response.").show();
                dataLoaded(rows);
              }
            });
          } else {
            $("#quackHistoryError").html("NRS problem occured.").show();
            dataLoaded(rows);
          }
        },
        "json"
      ).fail(function() {
        $("#quackHistoryError").html("NRS problem occured.").show();
        dataLoaded(rows);
      });
}

function quackGetStatus(account, swap) {
      var status = "Pending";
      var isSender = false;

      var senderChecker = new Array();
      var recipientChecker = new Array();

      var assetsA = swap.assetsA;
      var assetsB = swap.assetsB;

      //check that assetsA is equal to announcedAssets (PendingA)
      if (swap.assets) {

        for(i = 0; i < swap.assets.length; i++) {
          var annAsset = swap.assets[i];
          if(!annAsset) continue;

          annAsset.validated = false;

          if (assetsA) {

            for(k = 0; k < assetsA.length; k++) {
              var gotAsset = assetsA[k];

              if(!gotAsset) continue;
              if(annAsset.id != gotAsset.id) continue;
              if(annAsset.QNT > gotAsset.QNT) continue;
              if(annAsset.type != gotAsset.type) continue;
              annAsset.validated = true;
            }
          }

          senderChecker.push(annAsset);
        }
      }

      //check that assetsB is equal to expectedAssets (PendingB)
      if (swap.expectedAssets) {

        for(i = 0; i < swap.expectedAssets.length; i++) {
          var annAsset = swap.expectedAssets[i];
          if(!annAsset) continue;

          annAsset.validated = false;

          if (assetsB) {

            for(k = 0; k < assetsB.length; k++) {
              var gotAsset = assetsB[k];

              if(!gotAsset) continue;
              if(annAsset.id != gotAsset.id) continue;
              if(annAsset.QNT > gotAsset.QNT) continue;
              if(annAsset.type != gotAsset.type) continue;
              annAsset.validated = true;
            }
          }

          recipientChecker.push(annAsset);
        }
      }

      for(i = 0; i < senderChecker.length; i++) {
        if (!senderChecker[i].validated) {
          status = "PendingA";
          return status;
        }
      }

      for(i = 0; i < recipientChecker.length; i++) {
        if (!recipientChecker[i].validated) {
          status = "PendingB";
          return status;
        }
      }

      if(swap.minConfirmationsA < Quack.constants.defaultConfirmations) {
        status = "UnconfirmedA";
        return status;
      }

      if(swap.minConfirmationsB < Quack.constants.defaultConfirmations) {
        status = "UnconfirmedB";
        return status;
      }

      if(swap.minFinishHeightB > swap.minFinishHeightA) {
        status = "Invalid";
        return status;
      }

      status = "Valid";
      return status;
}

function quackSwapDetails(btn) {
      var key = btn.getAttribute("extra");
      $("#quackDetailsModal").attr("extra", key);
      $("#quackDetailsModal").modal("show");
}

function quackSwapTrigger(btn) {
      //attach hash to modal and show it
      var key = btn.getAttribute("extra");
      $("#quackFinalizeModal").attr("extra", key);
      $("#quackFinalizeModal").modal("show");
}

function quackSwapAccept(btn) {
      //attach hash to modal and show it
      var key = btn.getAttribute("extra");
      $("#quackAcceptModal").attr("extra", key);
      $("#quackAcceptModal").modal("show");
}

var NRS = (function(NRS, $, undefined) {

  NRS.pages.p_quack = function() {
    NRS.dataLoaded('');
  }

  NRS.setup.p_quack = function() {
    //Do one-time initialization stuff here
    //NRS.loadModalHTMLTemplates();
    if(NRS.rememberPassword) $('.secret_phrase').hide();
    Quack.constants.isTestnet = NRS.isTestNet;
    Quack.constants.triggerAccount = "NXT-DAXR-PR6C-EA3X-8YGM4";

    if(Quack.constants.isTestnet) {
      Quack.constants.triggerAccount = "NXT-YTBB-LT9J-SRRR-7KLBQ";
    }

    $("#quackMainAccount").val(NRS.accountRS);
    quackScan();
  }

  return NRS;
} (NRS || {}, jQuery));

//File name for debugging (Chrome/Firefox)
//@ sourceURL=nrs.quack.js
