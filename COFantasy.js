// jshint undef:true
// jshint eqeqeq:false
/* globals Set */
/* globals getAttrByName */
/* globals findObjs */
/* globals _ */
/* globals createObj */
/* globals log */
/* globals sendChat */
/* globals state */
/* globals Campaign */
/* globals getObj */
/* globals randomInteger */
/* globals spawnFx */
/* globals spawnFxBetweenPoints */
/* globals VecMath */
/* globals on */

// Needs the Vector Math scripty

var COF_loaded = false;

var COFantasy = COFantasy || function() {

  "use strict";

  var DEF_MALUS_APRES_TOUR_5 = true;
  var HISTORY_SIZE = 150;
  var eventHistory = [];
  var updateNextInitSet = new Set();

  // List of states:
  var cof_states = {
    mort: 'status_dead',
    surpris: 'status_lightning-helix',
    assome: 'status_pummeled',
    renverse: 'status_back-pain',
    aveugle: 'status_bleeding-eye',
    affaibli: 'status_half-heart',
    etourdi: 'status_half-haze',
    paralyse: 'status_fishing-net',
    ralenti: 'status_snail',
    endormi: 'status_sleepy',
    apeure: 'status_screaming'
  };

  function etatRendInactif(etat) {
    var res =
      etat == 'mort' || etat == 'surpris' || etat == 'assome' ||
      etat == 'etourdi' || etat == 'paralyse' || etat == 'endormi' ||
      etat == 'apeure';
    return res;
  }

  function error(msg, obj) {
    log(msg);
    log(obj);
    sendChat("COFantasy", msg);
  }

  function getState(token, etat, charId) {
    var res = false;
    if (token !== undefined) {
      res = token.get(cof_states[etat]);
      if (token.get('bar1_link') === "") return res;
      // else, look for the character value, if any
      if (charId === undefined) charId = token.get('represents');
    }
    if (charId === "") {
      error("token with a linked bar1 but representing no character", token);
      return false;
    }
    if (etat == 'affaibli') { //special case due ti new character sheet
      var de = parseInt(getAttrByName(charId, 'ETATDE'));
      if (de === 20) {
        if (res && token !== undefined) token.set(cof_states[etat], false);
        return false;
      } else if (de === 12) {
        if (!res && token !== undefined) token.set(cof_states[etat], true);
        return true;
      }
    }
    var attr = findObjs({
      _type: 'attribute',
      _characterid: charId,
      name: etat
    });
    if (attr.length === 0) {
      if (res && token !== undefined) token.set(cof_states[etat], false);
      return false;
    }
    if (!res && token !== undefined) token.set(cof_states[etat], true);
    return true;
  }

  function setState(token, etat, value, evt, charId) {
    var aff = {
      affecte: token,
      prev: {
        statusmarkers: token.get('statusmarkers')
      }
    };
    if (_.has(evt, 'affectes')) {
      var alreadyAff = evt.affectes.find(function(a) {
        return (a.affecte.id == token.id);
      });
      if (alreadyAff === undefined ||
        alreadyAff.prev.statusmarker === undefined) {
        evt.affectes.push(aff);
      }
    } else evt.affectes = [aff];
    if (value && etatRendInactif(etat) && isActive(token))
      removeFromTurnTracker(token.id, evt);
    token.set(cof_states[etat], value);
    if (etat == 'aveugle') {
      // We also change vision of the token
      aff.prev.light_angle = token.get('light_angle');
      if (value) token.set('light_angle', 0);
      else token.set('light_angle', 360);
    }
    if (token.get('bar1_link') !== "") {
      if (charId === '') {
        error("token with a linked bar1 but representing no character", token);
        return;
      }
      if (etat == 'affaibli') { //special case due to new character sheet
        var attr =
          findObjs({
            _type: 'attribute',
            _characterid: charId,
            name: 'ETATDE'
          });
        if (value) {
          if (attr.length === 0) {
            attr =
              createObj('attribute', {
                characterid: charId,
                name: 'ETATDE',
                current: 12
              });
            if (_.has(evt, 'attributes'))
              evt.attributes.push({
                attribute: attr,
                current: null
              });
            else evt.attributes = [{
              attribute: attr,
              current: null
            }];
          } else {
            attr = attr[0];
            if (parseInt(attr.get('current')) != 12) {
              if (_.has(evt, 'attributes'))
                evt.attributes.push({
                  attribute: attr,
                  current: 20
                });
              else evt.attributes = [{
                attribute: attr,
                current: 20
              }];
              attr.set('current', 12);
            }
          }
        } else {
          if (attr.length > 0) {
            attr = attr[0];
            if (parseInt(attr.get('current')) != 20) {
              if (_.has(evt, 'attributes'))
                evt.attributes.push({
                  attribute: attr,
                  current: 12
                });
              else evt.attributes = [{
                attribute: attr,
                current: 12
              }];
              attr.set('current', 20);
            }
          }
        }
      } else {
        var attrEtat =
          findObjs({
            _type: 'attribute',
            _characterid: charId,
            name: etat
          });
        if (value) {
          if (attrEtat.length === 0) {
            attrEtat =
              createObj('attribute', {
                characterid: charId,
                name: etat,
                current: value
              });
            if (_.has(evt, 'attributes'))
              evt.attributes.push({
                attribute: attrEtat,
                current: null
              });
            else evt.attributes = [{
              attribute: attrEtat,
              current: null
            }];
          }
        } else {
          if (attrEtat.length > 0) {
            attrEtat[0].remove();
            if (_.has(evt, 'deletedAttributes')) {
              evt.deletedAttributes.push(attrEtat[0]);
            } else {
              evt.deletedAttributes = [attrEtat[0]];
            }
          }
        }
      }
    }
    if (!value && etatRendInactif(etat) && isActive(token) ||
      etat == 'aveugle') updateInit(token, evt);
  }

  function logEvents() {
    var l = eventHistory.length;
    log("Historique de taille " + l);
    eventHistory.forEach(function(evt, i) {
      log("evt " + i);
      log(evt);
    });
  }

  function addEvent(evt) {
    eventHistory.push(evt);
    if (eventHistory.length > HISTORY_SIZE) {
      eventHistory.shift();
    }
  }

  function lastEvent() {
    var l = eventHistory.length;
    if (l === 0) return undefined;
    return eventHistory[l - 1];
  }

  function undoEvent() {
    var evt = eventHistory.pop();
    if (evt === undefined) {
      error("No event to undo", eventHistory);
      return;
    }
    sendChat("COFantasy", "/w GM undo " + evt.type);
    if (_.has(evt, 'affectes')) undoTokenEffect(evt);
    if (_.has(evt, 'attributes')) {
      // some attributes where modified too
      evt.attributes.forEach(function(attr) {
        if (attr.current === null) attr.attribute.remove();
        else {
          attr.attribute.set('current', attr.current);
          if (attr.max) attr.attribute.set('max', attr.max);
        }
      });
    }
    // deletedAttributes have a quadratic cost in the size of the history
    if (_.has(evt, 'deletedAttributes')) {
      evt.deletedAttributes.forEach(function(attr) {
        var oldId = attr.id;
        var newAttr =
          createObj('attribute', {
            characterid: attr.get('characterid'),
            name: attr.get('name'),
            current: attr.get('current'),
            max: attr.get('max')
          });
        eventHistory.forEach(function(evt) {
          if (evt.attributes !== undefined) {
            evt.attributes.forEach(function(attr) {
              if (attr.attribute.id == oldId) attr.attribute = newAttr;
            });
          }
        });
      });
    }
    if (_.has(evt, 'combat')) state.COFantasy.combat = evt.combat;
    if (_.has(evt, 'combat_pageid')) state.COFantasy.combat_pageid = evt.combat_pageid;
    if (_.has(evt, 'tour')) state.COFantasy.tour = evt.tour;
    if (_.has(evt, 'init')) state.COFantasy.init = evt.init;
    if (_.has(evt, 'updateNextInitSet'))
      updateNextInitSet = evt.updateNextInitSet;
    if (_.has(evt, 'turnorder'))
      Campaign().set('turnorder', evt.turnorder);
    if (_.has(evt, 'initiativepage'))
      Campaign().set('initiativepage', evt.initiativepage);
    return;
  }

  function undoTokenEffect(evt) {
    evt.affectes.forEach(function(aff) {
      var prev = aff.prev;
      var tok = aff.affecte;
      if (prev === undefined || tok === undefined) {
        error("Pas d'état précédant", aff);
        return;
      }
      _.each(prev, function(val, key, l) {
        tok.set(key, val);
      });
      sendChat("COF", "État de " + tok.get("name") + " restauré.");
    });
  }

  function caracOfMod(m) {
    switch (m) {
      case 'FOR':
        return 'FORCE';
      case 'DEX':
        return 'DEXTERITE';
      case 'CON':
        return 'CONSTITUTION';
      case 'INT':
        return 'INTELLIGENCE';
      case 'SAG':
        return 'SAGESSE';
      case 'CHA':
        return 'CHARISME';
      default:
        return;
    }
  }

  function modCarac(charId, carac) {
    var res = Math.floor((attributeAsInt(charId, carac, 10) - 10) / 2);
    return res;
  }

  //Renvoie le token et le charId. Si l'id ne correspond à rien, cherche si 
  //on trouve un nom de token, sur la page passée en argument (ou sinon
  //sur la page active de la campagne)
  function tokenOfId(id, name, pageId) {
    var token = getObj('graphic', id);
    if (token === undefined) {
      if (pageId === undefined) {
        pageId = Campaign().get('playerpageid');
      }
      var tokens = findObjs({
        _type: 'graphic',
        _subtype: 'token',
        _pageid: pageId,
        name: name
      });
      if (tokens.length === 0) return undefined;
      if (tokens.length > 1) {
        error("Ambigüité sur le choix d'un token : il y a " +
          tokens.length + " tokens nommés" + name, tokens);
      }
      token = tokens[0];
    }
    var charId = token.get('represents');
    if (charId === '') {
      error("le token sélectionné ne représente pas de personnage", token);
      return undefined;
    }
    return {
      token: token,
      charId: charId
    };
  }


  function parseAttack(msg) {
    // Arguments to cofattack should be:
    // - attacking token
    // - target token
    // - attack number (referring to the character sheet)
    // - some optional arguments, preceded by --

    var optArgs = msg.content.split(" --");
    var args = optArgs[0].split(" ");
    optArgs.shift();
    if (args.length < 4) {
      error("Not enough arguments to !cofattack: " + msg.content, args);
      return;
    }
    var attackingToken = getObj("graphic", args[1]);
    if (attackingToken === undefined) {
      error("Le premier argument de !cof-attack n'est pas un token" + msg.content, args[1]);
      return;
    }
    var targetToken = getObj("graphic", args[2]);
    if (targetToken === undefined) {
      error("le second argument de !cof-attack doit être un token" + msg.content, args[2]);
      return;
    }
    var attackLabel = args[3];
    // Optional arguments
    var options = {
      additionalDmg: []
    };
    var lastEtat; //dernier de etats et effets
    optArgs.forEach(function(arg) {
      arg = arg.trim();
      var cmd = arg.split(" ");
      if (cmd.length === 0) cmd = [arg];
      switch (cmd[0]) {
        case "auto":
        case "tempDmg":
        case "poudre":
        case "strigeSuce":
        case "semonce":
        case "pointsVitaux":
        case "pressionMortelle":
        case "reroll1":
        case "tirDouble":
        case "tranchant":
        case "percant":
        case "contondant":
        case "imparable":
        case "traquenard":
        case "affute":
        case "vampirise":
        case "mainsDEnergie":
        case "tirDeBarrage":
        case "ignoreObstacles":
        case "enflamme":
        case "magique":
          options[cmd[0]] = true;
          return;
        case "si":
          options.conditionAttaquant = parseCondition(cmd.slice(1));
          break;
        case "plus":
          if (cmd.length < 2) {
            sendChat("COF", "Il manque un argument à l'option --plus de !cof-attack");
            return;
          }
          var val = arg.substring(arg.indexOf(' ') + 1);
          options.additionalDmg.push({
            value: val
          });
          break;
        case "effet":
          if (cmd.length < 3) {
            error("Il manque un argument à l'option --effet de !cof-attack", cmd);
            return;
          }
          if (!estEffetTemp(cmd[1])) {
            error(cmd[1] + " n'est pas un effet temporaire répertorié", cmd);
            return;
          }
          var duree;
          duree = parseInt(cmd[2]);
          if (isNaN(duree) || duree < 1) {
            error(
              "Le deuxième argument de --effet doit être un nombre positif",
              cmd);
            return;
          }
          options.effets = options.effets || [];
          lastEtat = {
            effet: cmd[1],
            duree: duree
          };
          options.effets.push(lastEtat);
          return;
        case "etatSi":
          if (cmd.length < 3) {
            error("Il manque un argument à l'option --etatSi de !cof-attack", cmd);
            return;
          }
          var etat = cmd[1];
          if (!_.has(cof_states, etat)) {
            error("Etat non reconnu", cmd);
            return;
          }
          var condition = parseCondition(cmd.slice(2));
          if (condition === undefined) return;
          options.etats = options.etats || [];
          lastEtat = {
            etat: etat,
            condition: condition
          };
          options.etats.push(lastEtat);
          return;
        case "peur":
          if (cmd.length < 3) {
            error("Il manque un argument à l'option --peur de !cof-attack", cmd);
            return;
          }
          options.peur = {
            seuil: parseInt(cmd[1]),
            duree: parseInt(cmd[2])
          };
          if (isNaN(options.peur.seuil)) {
            error("Le premier argument de --peur doit être un nombre (le seuil)", cmd);
          }
          if (isNaN(options.peur.duree) || options.peur.duree <= 0) {
            error("Le deuxième argument de --peur doit être un nombre positif (la durée)", cmd);
          }
          return;
        case "feu":
        case "froid":
        case "acide":
        case "electrique":
        case "sonique":
        case "poison":
        case "maladie":
          var l = options.additionalDmg.length;
          if (l > 0) {
            options.additionalDmg[l - 1].type = cmd[0];
          } else {
            options.type = cmd[0];
          }
          break;
        case "sournoise":
        case "de6Plus":
          if (cmd.length < 2) {
            sendChat("COF", "Il manque un argument à l'option --de6Plus de !cof-attack");
            return;
          }
          options.de6Plus = parseInt(cmd[1]);
          if (isNaN(options.de6Plus) || options.de6Plus < 0) {
            error("L'option --de6Plus de !cof-attack attend un argument entier positif", cmd);
            return;
          }
          break;
        case "fx":
          if (cmd.length < 2) {
            sendChat("COF", "Il manque un argument à l'option --fx de !cof-attack");
            return;
          }
          options.fx = cmd[1];
          break;
        case 'psave':
          var psaveopt = options;
          if (cmd.length > 3 && cmd[3] == 'local') {
            var psavel = options.additionalDmg.length;
            if (psavel > 0) {
              psaveopt = options.additionalDmg[psavel - 1];
            }
          }
          var psaveParams = parseSave(cmd);
          if (psaveParams) psaveopt.partialSave = psaveParams;
          return;
        case 'save':
          if (lastEtat) {
            if (lastEtat.save) {
              error("Redéfinition de la condition de save pour un effet", optArgs);
            }
            var saveParams = parseSave(cmd);
            if (saveParams) {
              lastEtat.save = saveParams;
              return;
            }
            return;
          }
          error("Pass d'effet auquel appliquer le save", optArgs);
          return;
        case "mana":
          if (cmd.length < 2) {
            error("Usage : --mana coût", cmd);
            return;
          }
          var mana = parseInt(cmd[1]);
          if (isNaN(mana) || mana < 1) {
            error("Le coût en mana doit être un nombre positif");
            return;
          }
          options.mana = mana;
          break;
        case "bonusAttaque":
          if (cmd.length < 2) {
            error("Usage : --bonusAttaque b", cmd);
            return;
          }
          var bAtt = parseInt(cmd[1]);
          if (isNaN(bAtt)) {
            error("Le bonus d'attaque doit être un nombre");
            return;
          }
          options.bonusAttaque = bAtt;
          return;
        case "puissant":
          if (cmd.length < 2) {
            options.puissant = true;
            return;
          }
          options.puissant =
            attributeAsBool(
              attackingToken.get('represents'), cmd[1] + "Puissant", false,
              attackingToken);
          return;
        case "rate":
        case "touche":
        case "critique":
        case "echecCritique":
          if (options.triche === undefined) {
            options.triche = cmd[0];
          } else {
            error("Option incompatible", optArgs);
          }
          return;
        case 'munition':
          if (cmd.length < 3) {
            error("Pour les munitions, il faut préciser le nom et le taux de pertes", cmd);
            return;
          }
          options.munition = {
            nom: cmd[1],
            taux: parseInt(cmd[2])
          };
          if (isNaN(options.munition.taux)) {
            error("Le taux de pertes des munitions doit être un nombre entre 0 et 100");
            options.munition.taux = 20;
          }
          return;
        default:
          sendChat("COF", "Argument de !cof-attack '" + arg + "' non reconnu");
      }
    });
    attack(msg.playerid, attackingToken, targetToken, attackLabel, options);
  }

  function sendChar(charId, msg) {
    sendChat('character|' + charId, msg);
  }

  // Fait dépenser de la mana, et si pas possible, retourne false
  function depenseMana(token, charId, cout, msg, evt) {
    var manaAttr = findObjs({
      _type: 'attribute',
      _characterid: charId,
      name: 'PM'
    });
    var hasMana = false;
    if (manaAttr.length > 0) {
      var manaMax = parseInt(manaAttr[0].get('max'));
      hasMana = !isNaN(manaMax) && manaMax > 0;
    }
    if (hasMana) {
      var bar2 = parseInt(token.get("bar2_value"));
      if (isNaN(bar2)) bar2 = 0;
      if (bar2 < cout) {
        msg = msg || '';
        sendChar(charId, " n'a pas assez de points de mana pour " + msg);
        return false;
      }
      evt.affectes = evt.affectes || [];
      evt.affectes.push({
        affecte: token,
        prev: {
          bar2_value: bar2
        }
      });
      updateCurrentBar(token, 2, bar2 - cout);
      return true;
    }
    sendChar(charId, " n'a pas de points de mana, action impossible");
    return false;
  }

  function parseSave(cmd) {
    if (cmd.length < 3) {
      error("Usage : --psave carac seuil", cmd);
      return;
    }
    var carac1;
    var carac2;
    if (cmd[1].length == 3) {
      carac1 = cmd[1];
      if (isNotCarac(cmd[1])) {
        error("Le premier argument de save n'est pas une caractéristique", cmd);
        return;
      }
    } else if (cmd[1].length == 6) { //Choix parmis 2 caracs
      carac1 = cmd[1].substr(0, 3);
      carac2 = cmd[1].substr(3, 3);
      if (isNotCarac(carac1) || isNotCarac(carac2)) {
        error("Le premier argument de save n'est pas une caractéristique", cmd);
        return;
      }
    } else {
      error("Le premier argument de save n'est pas une caractéristique", cmd);
      return;
    }

    var res = {
      carac: carac1,
      carac2: carac2,
      seuil: parseInt(cmd[2])
    };
    if (isNaN(res.seuil)) {
      error("Le deuxième argument de --psave n'est pas un nombre", cmd);
      return;
    }
    return res;
  }

  function parseCondition(args) {
    if (args.length < 2) {
      error("condition non reconnue", args);
      return undefined;
    }
    switch (args[0]) {
      case "etat":
        if (_.has(cof_states, args[1])) {
          return {
            type: 'etat',
            etat: args[1],
            text: args[1]
          };
        }
        return {
          type: 'attribut',
          attribute: args[1],
          text: args[1]
        };
      case "deAttaque":
        var valeurDeAttaque = parseInt(args[1]);
        if (isNaN(valeurDeAttaque)) {
          error("La condition de dé d'attaque doit être un nombre", args);
          // on continue exprès pour tomber dans le cas par défaut
        } else {
          return {
            type: 'deAttaque',
            seuil: valeurDeAttaque,
            text: args[1]
          };
        }
        /* falls through */
      default:
        return {
          type: args[0],
          attribute: args[1],
          text: args[1]
        };
    }
  }

  function testCondition(cond, attackingCharId, targetCharId, deAttaque) {
    switch (cond.type) {
      case "moins":
        var attackerAttr = attributeAsInt(attackingCharId, cond.attribute, 0);
        var targetAttr = attributeAsInt(targetCharId, cond.attribute, 0);
        return (targetAttr < attackerAttr);
      case "etat":
        return (getState(undefined, cond.etat, attackingCharId));
      case "attribut":
        return (attributeAsBool(attackingCharId, cond.attribute, false));
      case "deAttaque":
        if (deAttaque === undefined) {
          error("Condition de dé d'attque non supportée ici", cond);
          return true;
        }
        if (deAttaque < cond.seuil) return false;
        return true;
      default:
        error("Condition non reconnue", cond);
    }
    return false;
  }

  // bonus d'attaque d'un token, indépendament des options
  // Mise en commun pour attack et attaque-magique
  function bonusDAttaque(token, charId, explications, evt) {
    explications = explications || [];
    var attBonus = 0;
    var fortifie =
      attributeAsInt(charId, 'fortifie', 0, token);
    if (fortifie > 0) {
      attBonus += 3;
      fortifie--;
      explications.push("L'effet du fortifiant donne +3 à l'attaque. Il sera encore actif pour " + fortifie + " tests");
      if (fortifie === 0) {
        removeTokenAttr(token, charId, 'fortifie', evt);
      } else {
        setTokenAttr(token, charId, 'fortifie', fortifie, evt);
      }
    }
    attBonus += attributeAsInt(charId, 'actionConcertee', 0);
    if (attributeAsBool(charId, 'chant_des_heros', false, token)) {
      attBonus += 1;
      explications.push("Chant des héros donne +1 au jet d'attaque");
    }
    if (attributeAsBool(charId, 'benediction', false, token)) {
      attBonus += 1;
      explications.push("La bénédiction donne +1 au jet d'attaque");
    }
    return attBonus;
  }

  function rollNumber(s) {
    return parseInt(s.substring(3, s.indexOf(']')));
  }

  function getAttack(attackLabel, tokName, charId) {
    // Get attack number (does not correspond to the position in sheet !!!)
    var attackNumber = 0;
    var attPrefix, weaponName;
    while (true) {
      attPrefix = "repeating_armes_$" + attackNumber + "_";
      weaponName = getAttrByName(charId, attPrefix + "armenom");
      if (weaponName === undefined || weaponName === "") {
        error("Arme " + attackLabel + " n'existe pas pour " + tokName, charId);
        return;
      }
      var weaponLabel = weaponName.split(' ', 1)[0];
      if (weaponLabel == attackLabel) {
        weaponName = weaponName.substring(weaponName.indexOf(' ') + 1);
        return {
          attackPrefix: attPrefix,
          weaponName: weaponName
        };
      }
      attackNumber++;
    }
  }

  function tokenInit(token, charId) {
    var init = parseInt(getAttrByName(charId, 'DEXTERITE'));
    init += attributeAsInt(charId, 'INIT_DIV', 0);
    if (getState(token, 'aveugle', charId)) init -= 5;
    // Voie du pistolero rang 1 (plus vite que son ombre)
    attributesInitEnMain(charId).forEach(function(em) {
      var armeL = labelInitEnMain(em);
      if (attributeAsInt(charId, "charge_" + armeL, 0) > 0) {
        var initBonus = parseInt(em.get('current'));
        if (isNaN(initBonus) || initBonus < 0) {
          error("initBonusEnMain incorrect :" + initBonus, em);
          return;
        }
        init += initBonus;
      }
    });
    return init;
  }

  function soigneToken(token, soins, evt, callTrue, callMax) {
    var bar1 = parseInt(token.get("bar1_value"));
    var pvmax = parseInt(token.get("bar1_max"));
    if (isNaN(bar1) || isNaN(pvmax)) {
      error("Soins sur un token sans points de vie", token);
      return;
    }
    if (bar1 >= pvmax) {
      if (callMax) callMax();
      return;
    }
    if (soins < 0) soins = 0;
    if (evt.affectes === undefined) evt.affectes = [];
    evt.affectes.push({
      affecte: token,
      prev: {
        bar1_value: bar1
      }
    });
    bar1 += soins;
    var soinsEffectifs = soins;
    if (bar1 > pvmax) {
      soinsEffectifs -= (bar1 - pvmax);
      bar1 = pvmax;
    }
    updateCurrentBar(token, 1, bar1);
    if (callTrue) callTrue(soinsEffectifs);
  }

  function attack(playerId, attackingToken, targetToken, attackLabel, options) {
    /* Attacker and target infos */
    var attackerTokName = attackingToken.get("name");
    var attackingCharId = attackingToken.get("represents");
    if (attackingCharId === "") {
      error("Attacking token " + attackerTokName + " must represent a character", attackingToken);
      return;
    }
    var attacker = getObj("character", attackingCharId);
    if (attacker === undefined) {
      error("Unexpected undefined 1", attacker);
      return;
    }
    var attackerName = attacker.get("name");
    var targetTokName = targetToken.get("name");
    var targetCharId = targetToken.get("represents");
    if (targetCharId === "") {
      error("Target token " + targetTokName + " must represent a character ", targetToken);
      return;
    }
    var target = getObj("character", targetCharId);
    if (target === undefined) {
      error("Unexpected undefined 2", target);
      return;
    }
    var targetName = target.get("name");
    var pageId = targetToken.get('pageid');

    //Options automatically set by some attributes
    if (attributeAsBool(attackingCharId, 'fauchage', false)) {
      var seuilFauchage = 10 + modCarac(attackingCharId, 'FORCE');
      options.etats = options.etats || [];
      options.etats.push({
        etat: 'renverse',
        condition: {
          type: 'deAttaque',
          seuil: 15
        },
        save: {
          carac: 'FOR',
          carac2: 'DEX',
          seuil: seuilFauchage
        }
      });
    }
    var att = getAttack(attackLabel, attackerTokName, attackingCharId);
    if (att === undefined) return;
    // Get attack number (does not correspond to the position in sheet !!!)
    var attPrefix = att.attackPrefix;
    var weaponName = att.weaponName;
    if (options.conditionAttaquant !== undefined) {
      if (!testCondition(options.conditionAttaquant, attackingCharId, targetCharId)) {
        sendChar(attackingCharId, "ne peut pas utiliser " + weaponName);
        return;
      }
    }
    var evt = options.evt || {}; //the event to be stored in history
    // Si pas de mana, action impossible, sinon dépense de mana
    if (options.mana) {
      if (!depenseMana(attackingToken, attackingCharId, options.mana,
          weaponName, evt)) return;
    }
    // Effets quand on rentre en combat 
    if (!state.COFantasy.combat) {
      var selected = [{
        _id: attackingToken.id
      }, {
        _id: targetToken.id
      }];
      initiative(selected, evt);
    }
    var pacifisme_selected =
      findObjs({
        _type: "attribute",
        _characterid: attackingCharId,
        name: "pacifisme"
      });
    if (pacifisme_selected.length > 0) {
      pacifisme_selected[0].set("current", 0);
      sendChat("GM", "/w " + attackerTokName + " " + attackerTokName + " perd son pacifisme");
    }
    // Get expressions used in rolls
    // Construct attack roll
    // Portée
    var portee = getPortee(attackingCharId, attPrefix);
    if (portee > 0) options.distance = true;
    var m =
      malusDistance(attackingToken, attackingCharId, targetToken, portee, pageId, options.ignoreObstacles);
    if (isNaN(m.malus) || (options.auto && m.distance > portee)) {
      sendChar(attackingCharId, "est hors de portée de " + targetTokName + " pour une attaque utilisant " + weaponName);
      return;
    }
    var malusDist = m.malus;
    // Armes chargées
    if (options.semonce === undefined && options.tirDeBarrage === undefined) {
      var chargesArme = findObjs({
        _type: 'attribute',
        _characterid: attackingCharId,
        name: "charge_" + attackLabel
      });
      if (chargesArme.length > 0) {
        var currentCharge = parseInt(chargesArme[0].get('current'));
        if (isNaN(currentCharge) || currentCharge < 1) {
          sendChar(attackingCharId, "ne peut pas attaquer avec " + weaponName + " car elle n'est pas chargée");
          return;
        }
        if (options.tirDouble && currentCharge < 2) {
          sendChar(attackingCharId, "ne peut pas faire de tir double avec ses" + weaponName + "s car il n'en a pas au moins 2 chargées");
          return;
        }
        evt.attributes = evt.attributes || [];
        evt.attributes.push({
          attribute: chargesArme[0],
          current: currentCharge
        });
        if (options.tirDouble) currentCharge -= 2;
        else currentCharge -= 1;
        chargesArme[0].set('current', currentCharge);
        if (currentCharge === 0 &&
          attributeAsInt(attackingCharId, "initEnMain" + attackLabel, 0) > 0) {
          updateNextInit(attackingToken);
        }
      } else {
        if (options.tirDouble) {
          sendChar(attackingCharId, "ne peut pas faire de tir double avec ses" + weaponName + "s car il n'en a pas au moins 2 chargées");
          return;
        }
      }
    }
    var explications = m.explications || [];
    // Munitions
    if (options.munition) {
      if (attackingToken.get('bar1_link') === '') {
        error("Les munitions ne sont pas supportées pour les tokens qui ne sont pas liées à un personnage", attackingToken);
      }
      var munitionsAttr = findObjs({
        _type: 'attribute',
        _characterid: attackingCharId,
        name: 'munition_' + options.munition.nom
      });
      if (munitionsAttr.length === 0) {
        error("Pas de munition nommée " + options.munition.nom + " pour " + attackerName);
        return;
      }
      munitionsAttr = munitionsAttr[0];
      var munitions = munitionsAttr.get('current');
      if (munitions < 1 || (options.tirDouble && munitions < 2)) {
        sendChar(attackingCharId, "ne peut pas utiliser cette attaque, car elle n'a plus de " + options.munition.nom.replace(/_/g, ' '));
        return;
      }
      var munitionsMax = munitionsAttr.get('max');
      evt.attributes = evt.attributes || [];
      evt.attributes.push({
        attribute: munitionsAttr,
        current: munitions,
        max: munitionsMax
      });
      munitions--;
      if (randomInteger(100) < options.munition.taux) munitionsMax--;
      if (options.tirDouble) {
        munitions--;
        if (randomInteger(100) < options.munition.taux) munitionsMax--;
      }
      explications.push("Il reste " + munitions + " " +
        options.munition.nom.replace(/_/g, ' ') + " à " + attackerTokName);
      munitionsAttr.set('current', munitions);
      munitionsAttr.set('max', munitionsMax);
    }
    // Expression pour l'attaque
    var crit = getAttrByName(attackingCharId, attPrefix + "armecrit") || 20;
    crit = parseInt(crit);
    if (isNaN(crit) || crit < 1 || crit > 20) {
      error("Le critique n'est pas un nombre entre 1 et 20", crit);
      crit = 20;
    }
    if (options.affute) crit -= 1;
    var attSkill =
      getAttrByName(attackingCharId, attPrefix + "armeatk") ||
      getAttrByName(attackingCharId, "ATKCAC");
    var attSkillDiv = getAttrByName(attackingCharId, attPrefix + "armeatkdiv") || 0;
    attSkillDiv = parseInt(attSkillDiv);
    if (isNaN(attSkillDiv)) attSkillDiv = 0;
    var attSkillDivTxt = "";
    if (attSkillDiv > 0) attSkillDivTxt = " + " + attSkillDiv;
    else if (attSkillDiv < 0) attSkillDivTxt += attSkillDiv;
    var tempAttkMod; // Utilise la barre 3 de l'attaquant
    tempAttkMod = parseInt(attackingToken.get("bar3_value"));
    if (tempAttkMod === undefined || isNaN(tempAttkMod) || tempAttkMod === "") {
      tempAttkMod = 0;
    }
    var attBonus = tempAttkMod;
    if (options.mainsDEnergie) {
      // Check if target wears armor
      var targetArmorDef = parseInt(getAttrByName(targetCharId, "DEFARMURE"));
      if (isNaN(targetArmorDef) || targetArmorDef === 0) {
        attBonus += 2;
        explications.push("Mains d'énergie, la cible n'a pas d'armure => +2 au jet d'attaque");
      } else {
        var bonusMain = Math.min(5, 2 + targetArmorDef);
        attBonus += bonusMain;
        explications.push("Mains d'énergie => +" + bonusMain + " au jet d'attaque");
      }
    }
    attBonus -= malusDist;
    if (options.bonusAttaque) attBonus += options.bonusAttaque;
    // fortifie, chant des héros, action concertée
    attBonus += bonusDAttaque(attackingToken, attackingCharId, explications, evt);
    if (getState(attackingToken, 'renverse', attackingCharId)) {
      attBonus -= 5;
      explications.push("Attaquant à terre -> -5 à l'attaque");
    }
    if (getState(attackingToken, 'aveugle', attackingCharId)) {
      if (portee > 0) {
        attBonus -= 10;
        explications.push("Attaquant aveuglé -> -10 à l'attaque à distance");
      } else {
        attBonus -= 5;
        explications.push("Attaquant aveuglé -> -5 à l'attaque");
      }
    }
    if (options.tirDouble) {
      attBonus += 2;
      explications.push(attackerTokName + " tire avec 2 " + weaponName + "s à la fois!");
    }
    if (_.has(options, 'chance')) {
      attBonus += options.chance;
      var pc = options.chance / 10;
      explications.push(pc + " point" + ((pc > 1) ? "s" : "") + " de chance dépensé -> +" + options.chance);
    }
    if (options.semonce) {
      attBonus += 5;
    }
    var chasseurEmerite =
      attributeAsBool(attackingCharId, 'chasseurEmerite', false) &&
      charOfType(targetCharId, "animal");
    if (chasseurEmerite) {
      attBonus += 2;
      explications.push(attackerTokName + " est un chasseur émérite -> +2 en attaque et aux dommages");
    }
    var ennemiJure = findObjs({
      _type: 'attribute',
      _characterid: attackingCharId,
      name: 'ennemiJure'
    });
    if (ennemiJure.length === 0) ennemiJure = false;
    else ennemiJure = raceIs(targetCharId, ennemiJure[0].get('current'));
    if (ennemiJure) {
      var ejSag = modCarac(attackingCharId, 'SAGESSE');
      attBonus += ejSag;
      explications.push(attackerTokName + " attaque son ennemi juré -> +" + ejSag + " en attaque et +1d6 aux dommages");
    }
    if (attributeAsBool(attackingCharId, 'baroudHonneurActif', false, attackingToken)) {
      attBonus += 5;
      explications.push(attackerTokName + " porte une dernière attaque et s'effondre");
      setState(attackingToken, 'mort', true, evt, attackingCharId);
      removeTokenAttr(attackingToken, attackingCharId, 'baroudHonneurActif', evt);
    }
    var dice = 20;
    if (getState(attackingToken, 'affaibli', attackingCharId)) {
      dice = 12;
      explications.push("Attaquant affaibli -> d12 au lieu de d20 pour l'attaque");
    }
    var de = "d" + dice;
    if (options.imparable) {
      de = 2 + de + "k1";
    } else {
      de = 1 + de;
    }
    var attackRollExpr = addOrigin(attackerName, "[[" + de + "cs>" + crit + "cf1]]");
    var attackSkillExpr = addOrigin(attackerName, "[[" + attSkill + attSkillDivTxt + "]]");

    //Now construct damage roll
    // First the main roll
    var attNbDices = getAttrByName(attackingCharId, attPrefix + "armedmnbde") || 1;
    attNbDices = parseInt(attNbDices);
    var attDice = getAttrByName(attackingCharId, attPrefix + "armedmde") || 4;
    attDice = parseInt(attDice);
    if (isNaN(attDice) || attDice < 0 || isNaN(attNbDices) || attNbDices < 0) {
      error("Dés de l'attaque incorrect", attDice);
      return;
    }
    if (options.puissant) {
      attDice += 2;
    }
    var maxDmg = attNbDices * attDice;
    if (options.reroll1) attDice += "r1";
    var attCarBonus =
      getAttrByName(attackingCharId, attPrefix + "armedmcar") ||
      modCarac(attackingCharId, "FORCE");
    if (isNaN(attCarBonus)) {
      if (attCarBonus.startsWith('@{')) {
        var carac = caracOfMod(attCarBonus.substr(2, 3));
        if (carac) {
          var simplerAttCarBonus = modCarac(attackingCharId, carac);
          if (!isNaN(simplerAttCarBonus)) {
            attCarBonus = simplerAttCarBonus;
            maxDmg += attCarBonus;
          }
        }
      }
    } else maxDmg += attCarBonus;
    if (attCarBonus === "0" || attCarBonus === 0) attCarBonus = "";
    else attCarBonus = " + " + attCarBonus;
    var attDMBonus =
      parseInt(getAttrByName(attackingCharId, attPrefix + "armedmdiv"));
    maxDmg += attDMBonus;
    if (isNaN(attDMBonus) || attDMBonus === 0) attDMBonus = '';
    else if (attDMBonus > 0) attDMBonus = '+' + attDMBonus;
    if (options.pressionMortelle) {
      var pMortelle =
        tokenAttribute(targetCharId, 'pressionMortelle', targetToken);
      if (pMortelle.length === 0) {
        sendChar(attackingCharId, "Essaie une pression mortelle, mais aucun point vital de " + targetTokName + " n'a encore été affecté");
        return;
      }
      attNbDices = pMortelle[0].get('max');
      attDice = 4; //TODO : have an option for that
      attDMBonus = "+ " + pMortelle[0].get('current');
      attDMBonus = "";
    }
    if (_.has(options, "tempDmg")) {
      var forceTarg = modCarac(targetCharId, "FORCE");
      maxDmg -= forceTarg;
      if (forceTarg < 0) {
        attDMBonus = " +" + (-forceTarg);
      } else {
        attDMBonus = " -" + forceTarg;
      }
    }
    if (portee === 0) {
      if (attributeAsBool(targetCharId, 'cri_de_guerre', false, targetToken) &&
        attributeAsInt(attackingCharId, 'FORCE', 10) <= attributeAsInt(targetCharId, 'FORCE', 10) &&
        parseInt(attackingToken.get("bar1_max")) <= parseInt(targetToken.get("bar1_max"))) {
        attBonus -= 2;
        explications.push(attackerTokName + " a un peu peur de s'attaquer à " + targetTokName);
      }
      if (attributeAsBool(attackingCharId, 'rayon_affaiblissant', false, attackingToken)) {
        attBonus -= 2;
        attDMBonus += " -2";
        maxDmg -= 2;
        explications.push("L'effet du rayon affaiblissant donne -2 à l'attaque et aux dégâts");
      }
    }
    var mainDmgType = options.type || 'normal';
    //Ce qui n'est pas doublé en cas de critique
    if (options.de6Plus) {
      options.additionalDmg.push({
        type: mainDmgType,
        value: options.de6Plus + "d6"
      });
    }
    if (options.distance) {
      if (options.semonce) {
        options.additionalDmg.push({
          type: mainDmgType,
          value: '1d6'
        });
        maxDmg += 6;
        explications.push("Tir de semonce (+5 attaque et +1d6 DM)");
      } else { //bonus aux attaques de contact
        if (attributeAsBool(attackingCharId, 'agrandissement', false)) {
          attDMBonus += "+2";
          maxDmg += 2;
        }
      }
      var tirPrecis = attributeAsInt(attackingCharId, 'tirPrecis', 0);
      if (tirPrecis > 0) {
        var modDex = modCarac(attackingCharId, 'DEXTERITE');
        if (m.distance <= 5 * modDex) {
          attDMBonus += " + " + tirPrecis;
          maxDmg += tirPrecis;
          explications.push("Tir précis : +" + tirPrecis + " DM");
        }
      }
    }
    if (chasseurEmerite) {
      attDMBonus += "+2";
      maxDmg += 2;
    }
    if (ennemiJure) {
      options.additionalDmg.push({
        type: mainDmgType,
        value: '1d6'
      });
      maxDmg += 6;
    }
    if (options.traquenard) {
      if (attributeAsInt(attackingCharId, 'traquenard', 0, attackingToken) === 0) {
        sendChar(attackingCharId, "ne peut pas faire de traquenard, car ce n'est pas sa première attaque du combat");
        return;
      }
      var initAtt = tokenInit(attackingToken, attackingCharId);
      var initTarg = tokenInit(targetToken, targetCharId);
      if (initAtt >= initTarg) {
        attBonus += 2;
        options.additionalDmg.push({
          type: mainDmgType,
          value: '2d6'
        });
        explications.push(attackerTokName + " fait un traquenard !");
        maxDmg += 12;
      } else {
        explications.push(attackerTokName + " n'est pas assez rapide pour faire un traquenard à " + targetTokName);
      }
    }
    if (attributeAsInt(attackingCharId, 'traquenard', 0, attackingToken) > 0) {
      setTokenAttr(
        attackingToken, attackingCharId, 'traquenard', 0, evt);
    }
    if (attributeAsBool(attackingCharId, 'forgeron_' + attackLabel, false)) {
      var feuForgeron = attributeAsInt(attackingCharId, 'voieDuMetal', 0);
      if (feuForgeron < 1 || feuForgeron > 5) {
        error("Rang dans la voie du métal de " + attackerTokName + " inconnu ou incorrect", feuForgeron);
      } else {
        options.additionalDmg.push({
          type: 'feu',
          value: feuForgeron
        });
      }
    }
    var mainDmgRollExpr =
      addOrigin(attackerName, attNbDices + "d" + attDice + attCarBonus + attDMBonus);
    if (options.tirDouble || options.tirDeBarrage) {
      mainDmgRollExpr += " +" + mainDmgRollExpr;
      options.additionalDmg.forEach(function(dmSpec) {
        dmSpec.value += " +" + dmSpec.Value;
      });
      maxDmg = maxDmg * 2;
    }
    var ExtraDmgRollExpr = "";
    options.additionalDmg = options.additionalDmg.filter(function(dmSpec) {
      dmSpec.type = dmSpec.type || 'normal';
      if (dmSpec.type != mainDmgType || isNaN(dmSpec.value)) {
        ExtraDmgRollExpr += " [[" + dmSpec.value + "]]";
        return true;
      }
      // We have the same type and a number -> should be multiplied by crit
      mainDmgRollExpr += " + " + dmSpec.value;
      return false;
    });
    var mainDmgRoll = {
      type: mainDmgType,
      value: mainDmgRollExpr
    };

    var defenseExpr = getAttrByName(targetCharId, "DEF");
    var defenseBonus = 0;
    var pacifisme_target = attributeAsInt(targetCharId, 'pacifisme', 0, targetToken);
    defenseBonus += pacifisme_target;
    if (attributeAsBool(targetCharId, 'peau_d_ecorce', false, targetToken)) {
      defenseBonus += attributeAsInt(targetCharId, 'voieDesVegetaux', 0);
    }
    if (getState(targetToken, 'surpris', targetCharId)) defenseBonus -= 5;
    if (getState(targetToken, 'renverse', targetCharId)) defenseBonus -= 5;
    if (getState(targetToken, 'aveugle', targetCharId)) defenseBonus -= 5;
    if (getState(targetToken, 'etourdi', targetCharId) ||
      attributeAsBool(targetCharId, 'peurEtourdi', false, targetToken))
      defenseBonus -= 5;
    defenseBonus += attributeAsInt(targetCharId, 'bufDEF', 0, targetToken);
    defenseBonus += attributeAsInt(targetCharId, 'actionConcertee', 0, targetToken);
    if (attributeAsInt(targetCharId, 'DEFARMUREON', 1) === 0) {
      defenseBonus += attributeAsInt(targetCharId, 'vetementsSacres', 0, targetToken);
      defenseBonus += attributeAsInt(targetCharId, 'armureDeVent', 0, targetToken);
    }
    var attrsProtegePar = findObjs({
      _type: 'attribute',
      _characterid: targetCharId,
    });
    attrsProtegePar.forEach(function(attr) {
      var attrName = attr.get('name');
      if (attrName.startsWith('protegePar_')) {
        var nameProtecteur = attr.get('max');
        if (attr.get('bar1_link') === '') {
          if (attrName != 'protegePar_' + nameProtecteur + '_' + targetTokName) return;
        } else if (attrName != 'protegePar_' + nameProtecteur) return;
        var protecteur = tokenOfId(attr.get('current'), nameProtecteur, pageId);
        if (protecteur === undefined) {
          removeTokenAttr(targetToken, targetCharId, 'protegePar_' + nameProtecteur, evt);
          sendChar(targetCharId, "ne peut pas être protégé par " + nameProtecteur + " car aucun token le représentant n'est sur la page");
          return;
        }
        if (!isActive(protecteur.token)) {
          explications.push(nameProtecteur + " n'est pas en état de protéger " +
            targetTokName);
          return;
        }
        var distTargetProtecteur = distanceCombat(targetToken, protecteur.token, pageId);
        if (distTargetProtecteur > 0) {
          explications.push(nameProtecteur + " est trop loin de " +
            targetTokName + " pour le protéger");
          return;
        }
        if (attributeAsInt(protecteur.charId, 'DEFBOUCLIERON', 1) === 0) {
          explications.push(nameProtecteur +
            " ne porte pas son bouclier, il ne peut pas proteger " +
            targetTokName);
          return;
        }
        var defBouclierProtecteur = attributeAsInt(protecteur.charId, 'DEFBOUCLIER', 0);
        defenseBonus += defBouclierProtecteur;
        explications.push(nameProtecteur + " protège " +
          targetTokName + " de son bouclier (+" + defBouclierProtecteur + "DEF)");
      }
    });
    var interchange =
      interchangeable(attackingToken, targetToken, targetCharId, pageId);
    if (interchange.result) defenseBonus += 5;
    var defenseRollExpr = addOrigin(targetName, "[[" + defenseExpr + "]]");

    // toEvaluate inlines
    // 0: attack roll
    // 1: target defense expression
    // 2: attack skill expression
    // 3 : roll de dégâts principaux
    // 4+ : les rolls de dégâts supplémentaires
    // 4 + options.additionalDmg.length : dé de poudre

    var toEvaluate =
      attackRollExpr + " " + defenseRollExpr + " " + attackSkillExpr +
      " [[" + mainDmgRollExpr + "]]" + ExtraDmgRollExpr;
    if (options.poudre) toEvaluate += " [[1d20]]";
    sendChat(attackerName, toEvaluate, function(res) {
      var rolls = options.rolls || res[0];
      // Determine which roll number correspond to which expression
      var afterEvaluate = rolls.content.split(" ");
      var attRollNumber = rollNumber(afterEvaluate[0]);
      var defRollNumber = rollNumber(afterEvaluate[1]);
      var attSkillNumber = rollNumber(afterEvaluate[2]);
      var mainDmgRollNumber = rollNumber(afterEvaluate[3]);
      mainDmgRoll.total = rolls.inlinerolls[mainDmgRollNumber].results.total;
      mainDmgRoll.display = buildinline(rolls.inlinerolls[mainDmgRollNumber], mainDmgType, options.magique);
      options.additionalDmg.forEach(function(dmSpec, i) {
        var rRoll = rolls.inlinerolls[rollNumber(afterEvaluate[i + 4])];
        dmSpec.total = rRoll.results.total;
        var addDmType = dmSpec.type;
        dmSpec.display = buildinline(rRoll, addDmType, options.magique);
      });
      var d20roll = rolls.inlinerolls[attRollNumber].results.total;
      var attSkill = rolls.inlinerolls[attSkillNumber].results.total;
      var defense = rolls.inlinerolls[defRollNumber].results.total;
      if (options.intercepter) {
        defense = res[0].inlinerolls[defRollNumber].results.total;
      }
      defense += defenseBonus;
      // Malus de défense global pour les longs combats
      if (DEF_MALUS_APRES_TOUR_5)
        defense -= (Math.floor((state.COFantasy.tour - 1) / 5) * 2);
      if (options.triche) {
        switch (options.triche) {
          case "rate":
            if (d20roll >= crit) {
              if (crit < 2) d20roll = 1;
              else d20roll = randomInteger(crit - 1);
            }
            if ((d20roll + attSkill + attBonus) >= defense) {
              var maxd20roll = defense - attSkill - attBonus - 1;
              if (maxd20roll >= crit) maxd20roll = crit - 1;
              if (maxd20roll < 2) d20roll = 1;
              else d20roll = randomInteger(maxd20roll);
            }
            break;
          case "touche":
            if (d20roll == 1) d20roll = randomInteger(dice - 1) + 1;
            if ((d20roll + attSkill + attBonus) < defense) {
              var mind20roll = defense - attSkill - attBonus - 1;
              if (mind20roll < 1) mind20roll = 1;
              if (mind20roll >= dice) d20roll = dice;
              else d20roll = randomInteger(dice - mind20roll) + mind20roll;
            }
            break;
          case "critique":
            if (d20roll < crit) {
              if (crit <= dice) d20roll = randomInteger(dice - crit + 1) + crit - 1;
              else d20roll = dice;
            }
            break;
          case "echecCritique":
            if (d20roll > 1) d20roll = 1;
            break;
          default:
            error("Option inconnue", options.triche);
        }
        // now adjust the roll
        var attackInlineRoll = rolls.inlinerolls[attRollNumber];
        attackInlineRoll.results.total = d20roll;
        attackInlineRoll.results.rolls.forEach(function(roll) {
          switch (roll.type) {
            case "R":
              if (roll.results.length == 1) {
                roll.results[0].v = d20roll;
              }
              break;
            default:
              return;
          }
        });
      }
      var attackRoll = d20roll + attSkill + attBonus;
      var attackResult; // string
      var touche; //false: pas touché, 1 touché, 2 critique
      options.dmgSupplementaire = 0; //DM dépendant du jet de touché
      // Si point de chance, alors un échec critique peut être transformé
      if (d20roll == 1 && _.has(options, 'chance')) {
        d20roll = 11;
      }
      if (getState(targetToken, 'paralyse', targetCharId)) {
        d20roll = 20;
        explications.push("Cible paralysée -> réussite critique automatique");
      }
      // Calcule si touché, et les messages de dégats et attaque
      if (options.auto) {
        touche = 1;
      } else if (d20roll == 1) {
        attackResult =
          "<span style='color: #ff0000'>" + ": <b><i>ÉCHEC&nbsp;CRITIQUE</i></b>" + "'</span> ";
        touche = false;
        var confirmCrit = randomInteger(20);
        var critSug = "/w GM Jet de confirmation pour l'échec critique : " +
          confirmCrit + "/20. Suggestion d'effet : ";
        switch (confirmCrit) {
          case 1:
            critSug += "l'attaquant se blesse ou est paralysé un tour";
            break;
          case 2:
            critSug += "l'attaquant blesse un allié";
            break;
          case 3:
            critSug += "l'arme casse, ou une pièce d'armure se détache, ou -5 DEF un tour (comme surpris)";
            break;
          case 4:
            critSug += "l'attaquant lache son arme ou glisse et tombe";
            break;
          default:
            critSug += "simple échec";
        }
        sendChat('COF', critSug);
      } else if (d20roll >= crit) {
        attackResult =
          "<span style='color: #0000ff'>" + ": <b><i>CRITIQUE</i></b>" + "'</span> ";
        touche = 2;
      } else if (attributeAsInt(attackingCharId, 'champion', 0) > 0 && d20roll >= 15) {
        attackResult = " : <b><i>SUCCÈS</i></b>";
        touche = 1;
        explications.push(attackerTokName + " est un champion, son attaque porte !");
        options.dmgSupplementaire += randomInteger(6);
      } else if (attackRoll < defense) {
        attackResult = " : <i>Échec</i> ";
        touche = false;
      } else { // Touché normal
        attackResult = " : <b><i>SUCCÈS</i></b>";
        touche = 1;
      }
      // debut de la partie affichage
      var titre =
        "<b>" + attackerTokName + "</b> attaque <b>" + targetTokName +
        "</b> avec " + weaponName;
      var display = startFramedDisplay(playerId, titre, attacker);

      var attRollValue = buildinline(rolls.inlinerolls[attRollNumber]);
      if (attSkill > 0) attRollValue += "+" + attSkill;
      else if (attSkill < 0) attRollValue += attSkill;
      if (attBonus > 0) attRollValue += "+" + attBonus;
      else if (attBonus < 0) attRollValue += +attBonus;
      var line;
      if (!_.has(options, 'auto')) {
        line =
          "<b>Attaque :</b> " + attRollValue + " vs <b>" + defense + "</b> " +
          attackResult;
        addLineToFramedDisplay(display, line);
      }

      // Cas des armes à poudre
      if (options.poudre) {
        var poudreNumber = rollNumber(afterEvaluate[4 + options.additionalDmg.length]);
        var dePoudre = rolls.inlinerolls[poudreNumber].results.total;
        explications.push(
          "Dé de poudre : " + buildinline(rolls.inlinerolls[poudreNumber]));
        if (dePoudre === 1) {
          evt.type = "incident_poudre";
          if (d20roll === 1) {
            explications.push(
              weaponName + " explose ! L'arme est complètement détruite");
            sendChat("", "[[2d6]]", function(res) {
              var rolls = res[0];
              var explRoll = rolls.inlinerolls[0];
              var r = {
                total: explRoll.results.total,
                type: 'normal',
                display: buildinline(explRoll, 'normal')
              };
              options.additionalDmg = [];
              dealDamage(attackingToken, attackingCharId, r, evt, 1, options,
                explications,
                function(dmgDisplay, saveResult, dmg) {
                  var dmgMsg = "<b>Dommages pour " + attackerTokName + " :</b> " +
                    dmgDisplay;
                  addLineToFramedDisplay(display, dmgMsg);
                  finaliseAttackDisplay(display, explications, evt);
                });
            });
          } else {
            explications.push(
              "La poudre explose dans " + weaponName +
              ". L'arme est inutilisable jusqu'à la fin du combat");
            sendChat("", "[[1d6]]", function(res) {
              var rolls = res[0];
              var explRoll = rolls.inlinerolls[0];
              var r = {
                total: explRoll.results.total,
                type: 'normal',
                display: buildinline(explRoll, 'normal')
              };
              options.additionalDmg = [];
              dealDamage(attackingToken, attackingCharId, r, evt, 1, options,
                explications,
                function(dmgDisplay, saveResult, dmg) {
                  var dmgMsg = "<b>Dommages pour " + attackerTokName + " :</b> " +
                    dmgDisplay;
                  addLineToFramedDisplay(display, dmgMsg);
                  finaliseAttackDisplay(display, explications, evt);
                });
            });
            return; //normalement inutile
          }
        } else if (d20roll == dePoudre && touche) {
          attackResult = " : <i>Échec</i> ";
          touche = false;
          explications.push(weaponName + " fait long feu, le coup ne part pas");
        }
      }
      if (touche &&
        attributeAsBool(targetCharId, 'image_decalee', false, targetToken)) {
        var id = randomInteger(6);
        if (id > 4) {
          touche = false;
          explications.push("L'attaque passe à travers l'image de " + targetTokName);
        } else {
          explications.push("Malgré l'image légèrement décalée de " + targetTokName + " l'attaque touche");
        }
      }
      if (touche) {
        if (options.tirDeBarrage) explications.push("Tir de barrage : undo si la cible décide de ne pas bouger");
        if (options.pointsVitaux) explications.push(attackerTokName + " vise des points vitaux mais ne semble pas faire de dégâts");
        if (options.pressionMortelle) {
          removeTokenAttr(targetToken, targetCharId, 'pressionMortelle', evt);
          explications.push(attackerTokName + " libère la pression des points vitaux, l'effet est dévastateur !");
          spawnFx(targetToken.get('left'), targetToken.get('top'), 'bomb-death', pageId);
        }
        if (interchange.targets.length > 1) { //any target can be affected
          var n = randomInteger(interchange.targets.length);
          targetToken = interchange.targets[n - 1];
        }
        // change l'état de la cible, si spécifié
        if (options.enflamme) {
          var enflammePuissance = 1;
          if (options.puissant) enflammePuissance = 2;
          setTokenAttr(
            targetToken, targetCharId, 'enflamme', enflammePuissance, evt);
          explications.push(targetTokName + " prend feu !");
        }
        // Draw effect, if any
        if (_.has(options, "fx")) {
          var p1e = {
            x: attackingToken.get('left'),
            y: attackingToken.get('top')
          };
          var p2e = {
            x: targetToken.get('left'),
            y: targetToken.get('top')
          };
          spawnFxBetweenPoints(p1e, p2e, options.fx, pageId);
        }
        evt.type = "attaque";
        evt.action = {
          type: 'attaque',
          player_id: playerId,
          token_id: attackingToken.id,
          attacking_token: attackingToken,
          target_token: targetToken,
          attack_label: attackLabel,
          rolls: rolls,
          options: options
        };
        // Compte le nombre de saves pour la synchronisation
        // (On ne compte pas les psave, gérés dans dealDamage)
        var saves = 0;
        //ajoute les états sans save à la cible
        if (options.etats) {
          options.etats.forEach(function(ce) {
            if (ce.save) {
              saves++;
              return; //on le fera plus tard
            }
            if (testCondition(ce.condition, attackingCharId, targetCharId, d20roll)) {
              setState(targetToken, ce.etat, true, evt, targetCharId);
              explications.push(targetName + " est " + ce.etat + eForFemale(targetCharId) + " par l'attaque");
            } else {
              if (ce.condition.type == "moins") {
                explications.push(
                  "Grâce à sa " + ce.condition.text + ", " + targetTokName +
                  " n'est pas " + ce.etat + eForFemale(targetCharId));
              }
            }
          });
        }
        var savesEffets = 0;
        // Ajoute les effets sans save à la cible
        if (options.effets) {
          options.effets.forEach(function(ef) {
            if (ef.save) {
              saves++;
              savesEffets++;
              return; //on le fera plus tard
            }
            explications.push(targetName + " " + messageEffets[ef.effet].activation);
            setTokenAttr(
              targetToken, targetCharId, ef.effet, ef.duree, evt,
              undefined, getInit());
          });
        }
        // Tout ce qui se passe après les saves (autres que saves de diminution des dmg
        var afterSaves = function() {
          if (saves > 0) return; //On n'a pas encore fait tous les saves
          if (options.additionalDmg.length === 0 && mainDmgRoll.total === 0 &&
            attNbDices === 0) {
            // Pas de dégâts, donc pas d'appel à dealDamage
            finaliseAttackDisplay(display, explications, evt);
          } else {
            dealDamage(targetToken, targetCharId, mainDmgRoll, evt, touche,
              options, explications,
              function(dmgDisplay, saveResult, dmg) {
                if (options.strigeSuce) {
                  var suce =
                    attributeAsInt(
                      attackingCharId, 'strigeSuce', 0, attackingToken);
                  if (suce === 0) {
                    setTokenAttr(
                      attackingToken, attackingCharId, 'bufDEF', -3, evt);
                    explications.push(
                      attackerTokName + " s'agrippe à " + targetTokName +
                      " et commence à lui sucer le sang");
                  }
                  if (suce + dmg >= 6) {
                    explications.push(
                      "Repus, " + attackerTokName + " se détache et s'envole");
                    explications.push(targetTokName + " se sent un peu faible...");
                    setState(targetToken, 'affaibli', true, evt, targetCharId);
                    var defbuf =
                      attributeAsInt(attackingCharId, 'bufDEF', 0, attackingToken);
                    if (defbuf === -3) {
                      removeTokenAttr(
                        attackingToken, attackingCharId, 'bufDEF', evt);
                    } else if (defbuf !== 0) {
                      setTokenAttr(
                        attackingToken, attackingCharId, 'bufDEF', defbuf + 3, evt);
                    }
                  } else {
                    setTokenAttr(
                      attackingToken, attackingCharId, 'strigeSuce', suce + dmg, evt);
                    if (suce > 0)
                      explications.push(
                        attackerTokName + " continue à sucer le sang de " + targetTokName);
                  }
                }
                if (saveResult !== undefined) {
                  var smsg =
                    " Jet de " + options.partialSave.carac + " difficulté " +
                    options.partialSave.seuil + " pour réduire les dégâts.";
                  explications.push(smsg);
                  smsg = targetName + " fait " + saveResult.display;
                  if (saveResult.succes)
                    smsg += " -> réussite, dégâts divisés par 2";
                  else
                    smsg += " -> échec";
                  explications.push(smsg);
                }
                if (options.vampirise) {
                  soigneToken(attackingToken, dmg, evt, function(soins) {
                    explications.push(
                      "L'attaque soigne " + attackerTokName + " de " + soins +
                      " PV");
                  });
                }
                addLineToFramedDisplay(display, "<b>Dommages :</b> " + dmgDisplay);
                var st = attributeAsInt(targetCharId, 'sous_tension', -1, targetToken);
                if (st >= 0 && portee === 0) {
                  sendChat("", "[[1d6]]", function(res) {
                    var rolls = res[0];
                    var explRoll = rolls.inlinerolls[0];
                    var r = {
                      total: explRoll.results.total,
                      type: 'electrique',
                      display: buildinline(explRoll, 'electrique', true)
                    };
                    dealDamage(attackingToken, attackingCharId, r, evt, 1,
                      options, explications,
                      function(dmgDisplay, saveResult, dmg) {
                        var dmgMsg =
                          "<b>Décharge électrique sur " + attackerTokName + " :</b> " +
                          dmgDisplay;
                        addLineToFramedDisplay(display, dmgMsg);
                        finaliseAttackDisplay(display, explications, evt);
                      });
                  });
                }
                finaliseAttackDisplay(display, explications, evt);
              });
          }
        };
        var expliquer = function(msg) {
          explications.push(msg);
        };
        //Ajoute les états avec save à la cibles
        var etatsAvecSave = function() {
          if (savesEffets > 0) return; //On n'a pas encore fini avec les effets
          if (options.etats && saves > 0) {
            options.etats.forEach(function(ce) {
              if (ce.save) {
                if (testCondition(ce.condition, attackingCharId, targetCharId, d20roll)) {
                  var msgPour = " pour résister à un effet";
                  var msgRate = ", " + targetTokName + " est " + ce.etat + eForFemale(targetCharId) + " par l'attaque";
                  save(ce.save, targetCharId, targetToken, expliquer, msgPour, '', msgRate, function(reussite, rolltext) {
                    if (!reussite) {
                      setState(targetToken, ce.etat, true, evt, targetCharId);
                    }
                    saves--;
                    afterSaves();
                  });
                } else {
                  if (ce.condition.type == "moins") {
                    explications.push(
                      "Grâce à sa " + ce.condition.text + ", " + targetName +
                      " n'est pas " + ce.etat + eForFemale(targetCharId));
                  }
                  saves--;
                  afterSaves();
                }
              }
            });
          } else afterSaves();
        };
        // Ajoute les effets avec save à la cible
        var effetsAvecSave = function() {
          if (options.effets && savesEffets > 0) {
            options.effets.forEach(function(ef) {
              if (ef.save) {
                var msgPour = " pour résister à un effet";
                var msgRate = ", " + targetName + " " + messageEffets[ef.effet].activation;
                save(ef.save, targetCharId, targetToken, expliquer, msgPour, '', msgRate, function(reussite, rollText) {
                  if (!reussite) {
                    setTokenAttr(
                      targetToken, targetCharId, ef.effet, ef.duree, evt,
                      undefined, getInit());
                  }
                  saves--;
                  savesEffets--;
                  etatsAvecSave();
                });
              }
            });
          } else etatsAvecSave();
        };
        // Peut faire peur à la cible
        if (options.peur) {
          peurOneToken(targetToken, targetCharId, pageId, options.peur.seuil,
            options.peur.duree, {}, display, evt, effetsAvecSave);
        } else effetsAvecSave();
      } else {
        evt.type = 'failure';
        evt.action = {
          type: 'attaque',
          player_id: playerId,
          token_id: attackingToken.id,
          attacking_token: attackingToken,
          target_token: targetToken,
          attack_label: attackLabel,
          rolls: rolls,
          options: options
        };
        /* Draw failed effect */
        if (_.has(options, "fx") && portee > 0) {
          var p1 = {
            x: attackingToken.get('left'),
            y: attackingToken.get('top')
          };
          var p2 = {
            x: targetToken.get('left'),
            y: targetToken.get('top')
          };
          // Compute some gaussian deviation in [0, 1]
          var dev =
            (Math.random() + Math.random() + Math.random() + Math.random() +
              Math.random() + 1) / 6;
          // take into account by how far we miss
          dev = dev * (d20roll == 1) ? 2 : ((attackRoll - defense) / 20);
          if (Math.random() > 0.5) dev = -dev;
          p2.x += dev * (p2.y - p1.y);
          p2.y += dev * (p2.x - p1.x);
          spawnFxBetweenPoints(p1, p2, options.fx, pageId);
        }
        finaliseAttackDisplay(display, explications, evt);
      }
    });
  }

  function finaliseAttackDisplay(display, explications, evt) {
    addEvent(evt);
    explications.forEach(function(expl) {
      addLineToFramedDisplay(display, expl);
    });
    sendChat("", endFramedDisplay(display));
  }

  // RD spécifique au type
  function typeRD(charId, dmgType) {
    if (dmgType === undefined || dmgType == 'normal') return 0;
    return attributeAsInt(charId, 'RD_' + dmgType, 0);
  }

  function probaSucces(de, seuil, nbreDe) {
    if (nbreDe == 2) {
      var proba1 = probaSucces(de, seuil, 1);
      return 1 - (1 - proba1) * (1 - proba1);
    }
    if (seuil < 2) seuil = 2; // 1 est toujours un échec
    else if (seuil > 20) seuil = 20;
    return ((de - seuil) + 1) / de;
  }

  function meilleureCarac(carac1, carac2, charId, token, seuil) {
    var bonus1 = bonusTestCarac(carac1, charId, token);
    if (carac1 == 'DEX') bonus1 += attributeAsInt(charId, 'reflexesFelins', 0);
    var bonus2 = bonusTestCarac(carac2, charId, token);
    if (carac2 == 'DEX') bonus2 += attributeAsInt(charId, 'reflexesFelins', 0);
    var nbrDe1 = nbreDeTestCarac(carac1, charId);
    var nbrDe2 = nbreDeTestCarac(carac2, charId);
    var de1 = deTestCarac(carac1, charId, token);
    var de2 = deTestCarac(carac2, charId, token);
    var proba1 = probaSucces(de1, seuil - bonus1, nbrDe1);
    var proba2 = probaSucces(de2, seuil - bonus2, nbrDe2);
    if (proba2 > proba1) return carac2;
    return carac1;
  }

  function save(s, charId, token, expliquer, msgPour, msgReussite, msgRate, afterSave) {
    var bonusAttrs = [];
    var carac = s.carac;
    //Cas où le save peut se faire au choix parmis 2 caracs
    if (s.carac2) {
      carac = meilleureCarac(carac, s.carac2, charId, token, s.seuil);
    }
    if (carac == 'DEX') {
      bonusAttrs.push('reflexesFelins');
    }
    testCaracteristique(charId, carac, bonusAttrs, s.seuil, token,
      function(reussite, rollText) {
        var smsg =
          " Jet de " + carac + " difficulté " + s.seuil + msgPour;
        expliquer(smsg);
        smsg = token.get('name') + " fait " + rollText;
        if (reussite) {
          smsg += " -> réussite" + msgReussite;
        } else {
          smsg += " -> échec" + msgRate;
        }
        expliquer(smsg);
        afterSave(reussite, rollText);
      });
  }

  function partialSave(ps, charId, token, showTotal, dmgDisplay, total, expliquer, afterSave) {
    if (ps.partialSave !== undefined) {
      save(ps.partialSave, charId, token, expliquer, " pour réduire les dégâts",
        ", dégâts divisés par 2", '',
        function(succes, rollText) {
          if (succes) {
            if (showTotal) dmgDisplay = "(" + dmgDisplay + ")";
            dmgDisplay = dmgDisplay + " / 2";
            showTotal = true;
            total = Math.ceil(total / 2);
          } else {}
          afterSave({
            succes: succes,
            display: rollText,
            dmgDisplay: dmgDisplay,
            total: total,
            showTotal: showTotal
          });
        });
    } else afterSave();
  }

  function dealDamage(token, charId, dmg, evt, crit, options, explications, displayRes) {
    if (options === undefined) options = {};
    var expliquer = function(msg) {
      if (explications) explications.push(msg);
      else sendChar(charId, msg);
    };
    if (options.aoe === undefined && attributeAsBool(charId, 'formeGazeuse', false, token)) {
      expliquer("L'attaque passe à travers de " + token.get('name'));
      if (displayRes) displayRes('0', undefined, 0);
      return 0;
    }
    crit = crit || 1;
    var otherDmg = options.additionalDmg || [];
    evt.affectes = evt.affectes || [];
    var dmgDisplay = dmg.display;
    var dmgTotal = dmg.total;
    var showTotal = false;
    if (crit > 1) {
      dmgDisplay += " X " + crit;
      dmgTotal = dmgTotal * crit;
      if (options.affute) {
        var bonusCrit = randomInteger(6);
        dmgDisplay = "(" + dmgDisplay + ")+" + bonusCrit;
        dmgTotal += bonusCrit;
      } else {
        showTotal = true;
      }
    }
    //On trie les DM supplémentaires selon leur type
    var dmgParType = {};
    otherDmg.forEach(function(d) {
      if (_.has(dmgParType, d.type)) dmgParType[d.type].push(d);
      else dmgParType[d.type] = [d];
    });

    // Dommages déterminés après le jet d'attaque, donc pas de jet de dé (pour simplifier), mais une valeur venant de randomInt
    if (options.dmgSupplementaire) {
      dmgTotal += options.dmgSupplementaire;
      if (crit > 1 && dmgExtra === undefined) dmgDisplay = "(" + dmgDisplay + ") ";
      dmgDisplay += "+" + options.dmgSupplementaire;
      showTotal = true;
    }
    // Dommages de même type que le principal, mais à part, donc non affectés par les critiques
    var mainDmgType = dmg.type;
    var dmgExtra = dmgParType[mainDmgType];
    if (dmgExtra && dmgExtra.length > 0) {
      if (crit > 1) dmgDisplay = "(" + dmgDisplay + ")";
      showTotal = true;
      var count = dmgExtra.length;
      dmgExtra.forEach(function(d) {
        count--;
        partialSave(d, charId, token, false, d.display, d.total, expliquer,
          function(res) {
            if (res) {
              dmgTotal += res.total;
              dmgDisplay += "+" + res.dmgDisplay;
            } else {
              dmgTotal += d.total;
              dmgDisplay += "+" + d.display;
            }
            if (count === 0) dealDamageAfterDmgExtra(token, charId, mainDmgType, dmgTotal, dmgDisplay, showTotal, dmgParType, dmgExtra, crit, options, evt, expliquer, displayRes);
          });
      });
    } else {
      return dealDamageAfterDmgExtra(token, charId, mainDmgType, dmgTotal, dmgDisplay, showTotal, dmgParType, dmgExtra, crit, options, evt, expliquer, displayRes);
    }
  }

  function applyRDMagique(rdMagique, dmgType, total, display) {
    if (total && rdMagique && rdMagique > 0) {
      switch (dmgType) {
        case 'normal':
        case 'poison':
        case 'maladie':
          if (total < rdMagique) {
            display += "-" + total;
            rdMagique -= total;
            total = 0;
          } else {
            display += "-" + rdMagique;
            total -= rdMagique;
            rdMagique = 0;
          }
          return {
            total: total,
            rdMagique: rdMagique,
            display: display
          };
        default:
          return;
      }
    }
    return;
  }


  function dealDamageAfterDmgExtra(token, charId, mainDmgType, dmgTotal, dmgDisplay, showTotal, dmgParType, dmgExtra, crit, options, evt, expliquer, displayRes) {
    var rdMain = typeRD(charId, mainDmgType);
    if (rdMain > 0 && dmgTotal > 0) {
      dmgTotal -= rdMain;
      if (dmgTotal < 0) {
        rdMain += dmgTotal;
        dmgTotal = 0;
      }
      dmgDisplay += "-" + rdMain;
      showTotal = true;
    }
    var rdMagique;
    if (options.magique) rdMagique = 0;
    else rdMagique = typeRD(charId, 'sauf_magique');
    if (rdMagique) showTotal = true;
    var resMagique = applyRDMagique(rdMagique, mainDmgType, dmgTotal, dmgDisplay);
    if (resMagique) {
      rdMagique = resMagique.rdMagique;
      dmgTotal = resMagique.total;
      dmgDisplay = resMagique.display;
    }
    var armureM = attributeAsInt(charId, 'armureMagique', 0, token);
    var invulnerable = attributeAsBool(charId, 'invulnerable', false);
    var mitigate = function(dmgType, divide, zero) {
      if (estElementaire(dmgType)) {
        if (invulnerable) {
          divide();
        }
      } else {
        if (invulnerable && (dmgType == 'poison' || dmgType == 'maladie')) {
          zero();
        } else if (armureM > 0) {
          divide();
        }
      }
    };
    // Damage mitigaters for main damage
    mitigate(mainDmgType,
      function() {
        dmgTotal = Math.ceil(dmgTotal / 2);
        if (dmgExtra) dmgDisplay = "(" + dmgDisplay + ")";
        dmgDisplay += " / 2";
        showTotal = true;
      },
      function() {
        dmgTotal = 0;
      });
    // Other sources of damage
    // First count all other sources of damage, for synchronization
    var count = 0;
    for (var dt in dmgParType) {
      count += dmgParType[dt].length;
    }
    var dealOneType = function(dmgType) {
      if (dmgType == mainDmgType) {
        count -= dmgParType[dmgType].length;
        if (count === 0) dealDamageAfterOthers(token, charId, crit, options, evt, expliquer, displayRes, dmgTotal, dmgDisplay, showTotal);
        return; //type principal déjà géré
      }
      showTotal = true;
      var dm = 0;
      var typeDisplay = "";
      var typeCount = dmgParType[dmgType].length;
      dmgParType[dmgType].forEach(function(d) {
        partialSave(d, charId, token, false, d.display, d.total, expliquer,
          function(res) {
            if (res) {
              dm += res.total;
              if (typeDisplay === '') typeDisplay = res.dmgDisplay;
              else typeDisplay += "+" + res.dmgDisplay;
            } else {
              dm += d.total;
              if (typeDisplay === '') typeDisplay = d.display;
              else typeDisplay += "+" + d.display;
            }
            typeCount--;
            if (typeCount === 0) {
              var rdl = typeRD(charId, dmgType);
              if (rdl > 0 && dm > 0) {
                dm -= rdl;
                if (dm < 0) {
                  rdl += dm;
                  dm = 0;
                }
                typeDisplay += "-" + rdl;
              }
              var resMagique = applyRDMagique(rdMagique, dmgType, dm, typeDisplay);
              if (resMagique) {
                rdMagique = resMagique.rdMagique;
                dm = resMagique.total;
                typeDisplay = resMagique.display;
              }
              mitigate(dmgType,
                function() {
                  dm = Math.ceil(dm / 2);
                  if (dmgParType[dmgType].length > 1) typeDisplay = "(" + typeDisplay + ")";
                  typeDisplay += " / 2";
                },
                function() {
                  dm = 0;
                });
              dmgTotal += dm;
              dmgDisplay += "+" + typeDisplay;
            }
            count--;
            if (count === 0) dealDamageAfterOthers(token, charId, crit, options, evt, expliquer, displayRes, dmgTotal, dmgDisplay, showTotal);
          });
      });
    };
    if (count > 0) {
      for (var dmgType in dmgParType) {
        dealOneType(dmgType);
      }
    } else {
      return dealDamageAfterOthers(token, charId, crit, options, evt, expliquer, displayRes, dmgTotal, dmgDisplay, showTotal);
    }
  }

  function mort(token, charId, evt) {
    setState(token, 'mort', true, evt, charId);
    var targetPos = {
      x: token.get('left'),
      y: token.get('top')
    };
    spawnFxBetweenPoints(targetPos, {
      x: 400,
      y: 400
    }, "splatter-blood");
  }

  function dealDamageAfterOthers(token, charId, crit, options, evt, expliquer, displayRes, dmgTotal, dmgDisplay, showTotal) {
    // Now do some dmg mitigation rolls, if necessary
    if ((options.distance || options.aoe) &&
      attributeAsBool(charId, 'a_couvert', false, token)) {
      if (showTotal) dmgDisplay = "(" + dmgDisplay + ")";
      dmgDisplay += " / 2";
      dmgTotal = Math.ceil(dmgTotal / 2);
      showTotal = true;
    }
    partialSave(options, charId, token, showTotal, dmgDisplay, dmgTotal,
      expliquer,
      function(saveResult) {
        if (saveResult) {
          dmgTotal = saveResult.total;
          dmgDisplay = saveResult.dmgDisplay;
          showTotal = saveResult.showTotal;
        }
        var rd = attributeAsInt(charId, 'RDS', 0);
        if (crit > 1) rd += attributeAsInt(charId, 'RD_critique', 0);
        if (options.tranchant) rd += attributeAsInt(charId, 'RD_tranchant', 0);
        if (options.percant) rd += attributeAsInt(charId, 'RD_percant', 0);
        if (options.contondant) rd += attributeAsInt(charId, 'RD_contondant', 0);
        if (options.intercepter) rd += options.intercepter;
        if (rd > 0) {
          dmgDisplay += "-" + rd;
          showTotal = true;
        }
        dmgTotal -= rd;
        if (dmgTotal < 0) dmgTotal = 0;
        /* compute effect on target */
        if (options.pointsVitaux && dmgTotal > 0) { //dégâts retardés pour une pression mortelle
          var pMortelle = tokenAttribute(charId, 'pressionMortelle', token);
          var dmgPMort = dmgTotal;
          var numberPMort = 1;
          if (pMortelle.length > 0) {
            dmgPMort += pMortelle[0].get('current');
            numberPMort += pMortelle[0].get('max');
          }
          setTokenAttr(
            token, charId, 'pressionMortelle', dmgPMort, evt, undefined,
            numberPMort);
        } else {
          var bar1 = parseInt(token.get('bar1_value'));
          var pvmax = parseInt(token.get('bar1_max'));
          if (isNaN(bar1)) {
            error("Pas de points de vie chez la cible", token);
            bar1 = 0;
            pvmax = 0;
          } else if (isNaN(pvmax)) {
            pvmax = bar1;
            token.set("bar1_max", bar1);
          }
          var manaAttr = findObjs({
            _type: 'attribute',
            _characterid: charId,
            name: 'PM'
          });
          var hasMana = false;
          if (manaAttr.length > 0) {
            var manaMax = parseInt(manaAttr[0].get('max'));
            hasMana = !isNaN(manaMax) && manaMax > 0;
          }
          var tempDmg = 0;
          if (hasMana) {
            tempDmg = attributeAsInt(charId, 'DMTEMP', 0, token);
          } else {
            tempDmg = parseInt(token.get("bar2_value"));
            if (isNaN(tempDmg)) {
              if (options.tempDmg) { //then try to set bar2 correctly
                var link = token.get("bar1_link");
                if (link === "") {
                  token.set("bar2_max", pvmax);
                } else {
                  var tmpHitAttr =
                    findObjs({
                      _type: "attribute",
                      _characterid: charId,
                      name: "DMTEMP"
                    });
                  var dmTemp;
                  if (tmpHitAttr.length === 0) {
                    dmTemp =
                      createObj("attribute", {
                        characterid: charId,
                        name: "DMTEMP",
                        current: 0,
                        max: pvmax
                      });
                  } else {
                    dmTemp = tmpHitAttr[0];
                  }
                  token.set("bar2_max", pvmax);
                  token.set("bar2_link", dmTemp.id);
                }
              }
              tempDmg = 0;
            }
          }
          if (options.tempDmg) {
            var oldTempDmg = tempDmg;
            tempDmg += dmgTotal;
            if (tempDmg > pvmax) tempDmg = pvmax;
            if (hasMana) {
              setTokenAttr(token, charId, 'DMTEMP', tempDmg, evt);
            } else {
              evt.affectes.push({
                affecte: token,
                prev: {
                  bar2_value: oldTempDmg
                }
              });
              updateCurrentBar(token, 2, tempDmg);
            }
          } else {
            evt.affectes.push({
              affecte: token,
              prev: {
                bar1_value: bar1
              }
            });
            bar1 = bar1 - dmgTotal;
            if (bar1 <= 0) {
              if (attributeAsBool(charId, 'sergent', false) && !attributeAsBool(charId, 'sergentUtilise', false, token)) {
                expliquer(token.get('name') + " évite l'attaque in-extremis");
                setTokenAttr(token, charId, 'sergentUtilise', true, evt);
              } else {
                updateCurrentBar(token, 1, 0);
                if (attributeAsBool(charId, 'baroudHonneur', false)) {
                  expliquer(token.get('name') + " devrait être mort, mais il continue à se battre !");
                  setTokenAttr(token, charId, 'baroudHonneurActif', true, evt);
                } else {
                  var defierLaMort = attributeAsInt(charId, 'defierLaMort', 0);
                  if (defierLaMort > 0) {
                    save({
                        carac: 'CON',
                        seuil: defierLaMort
                      }, charId, token,
                      expliquer, " pour défier la mort", ", conserve 1 PV", '',
                      function(reussite, rollText) {
                        if (reussite) {
                          updateCurrentBar(token, 1, 1);
                          bar1 = 1;
                          setTokenAttr(token, charId, 'defierLaMort', defierLaMort + 10, evt);
                        } else mort(token, charId, evt);
                        if (bar1 > 0 && tempDmg >= bar1) { //assomé
                          setState(token, 'assome', true, evt, charId);
                        }
                        if (showTotal) dmgDisplay += " (total = " + dmgTotal + ")";
                        if (displayRes === undefined) return dmgDisplay;
                        displayRes(dmgDisplay, saveResult, dmgTotal);
                      });
                    if (displayRes === undefined) return dmgDisplay;
                    return;
                  } else mort(token, charId, evt);
                }
              }
            } else { // bar1>0
              updateCurrentBar(token, 1, bar1);
            }
          }
          if (bar1 > 0 && tempDmg >= bar1) { //assomé
            setState(token, 'assome', true, evt, charId);
          }
          if (showTotal) dmgDisplay += " (total = " + dmgTotal + ")";
        }
        if (displayRes === undefined) return dmgDisplay;
        displayRes(dmgDisplay, saveResult, dmgTotal);
      });
    return dmgDisplay;
  }


  function startFramedDisplay(playerId, titre, character, imageSize) {
    var playerBGColor = getObj("player", playerId).get("color");
    var playerTXColor = (getBrightness(playerBGColor) < 50) ? "#FFF" : "#000";
    var image = "";
    if (character !== undefined) {
      if (imageSize === undefined) imageSize = 45;
      image =
        "<img src='" + character.get('avatar') +
        "' style='float:left; width:" + imageSize + "%; max-width:80px; max-height:120px'>";
    }
    var res =
      "/direct <div style='font-family: Georgia; font-weight: normal; overflow:auto; text-align: center; vertical-align: middle; padding: 5px 0px; margin-top: 0.2em; border: 1px solid #000; border-radius: 10px 10px 0px 0px; color: " +
      playerTXColor + "; background-color: " + playerBGColor +
      ";' title=''> " + image + titre + "</div>" +
      "<span style='font-family: Tahoma; font-weight: normal;'>";
    return {
      output: res,
      isOdd: true
    };
  }

  function addLineToFramedDisplay(display, line) {
    var formatedLine = "<div style='padding: 5px; border-left: 1px solid #000; border-right: 1px solid #000; border-radius: 0px; background-color: ";
    if (display.isOdd) {
      formatedLine += "#CEC7B6";
      display.isOdd = false;
    } else {
      formatedLine += "#B6AB91";
      display.isOdd = true;
    }
    formatedLine += "; color: #000;'>";
    formatedLine += line;
    formatedLine += "</div>";
    display.output += formatedLine;
  }

  function endFramedDisplay(display) {
    // Ajout des coins arrondis à la fin
    var res =
      display.output.replace(/border-radius: 0px;(?!.*border-radius: 0px;)/g, "border-radius: 0px 0px 10px 10px; border-bottom: 1px solid #000;");
    res += "</span></div>";
    return res;
  }

  function buildinline(inlineroll, dmgType, magique) {
    var InlineBorderRadius = 5;
    var InlineColorOverride = "";
    var values = [];
    var critRoll = false;
    var failRoll = false;
    var critCheck = false;
    var failCheck = false;
    var highRoll = false;
    var lowRoll = false;
    var noHighlight = false;

    inlineroll.results.rolls.forEach(function(roll) {
      var result = processRoll(roll, critRoll, failRoll, highRoll, lowRoll, noHighlight);
      if (result.value.toString().indexOf("critsuccess") != -1) critCheck = true;
      if (result.value.toString().indexOf("critfail") != -1) failCheck = true;
      values.push(result.value);
      critRoll = result.critRoll;
      failRoll = result.failRoll;
      highRoll = result.highRoll;
      lowRoll = result.lowRoll;
      noHighlight = result.noHighlight;
    });

    // Overrides the default coloring of the inline rolls...
    switch (dmgType) {
      case 'normal':
        if (magique)
          InlineColorOverride = " background-color: #FFFFFF; color: #534200;";
        else
          InlineColorOverride = " background-color: #F1E6DA; color: #000;";
        break;
      case 'feu':
        InlineColorOverride = " background-color: #FF3011; color: #440000;";
        break;
      case 'froid':
        InlineColorOverride = " background-color: #77FFFF; color: #004444;";
        break;
      case 'acide':
        InlineColorOverride = " background-color: #80BF40; color: #020401;";
        break;
      case 'sonique':
        InlineColorOverride = " background-color: #E6CCFF; color: #001144;";
        break;
      case 'electrique':
        InlineColorOverride = " background-color: #FFFF80; color: #222200;";
        break;
      default:
        if (critCheck && failCheck) {
          InlineColorOverride = " background-color: #8FA4D4; color: #061539;";
        } else if (critCheck && !failCheck) {
          InlineColorOverride = " background-color: #88CC88; color: #004400;";
        } else if (!critCheck && failCheck) {
          InlineColorOverride = " background-color: #FFAAAA; color: #660000;";
        } else {
          InlineColorOverride = " background-color: #FFFEA2; color: #000;";
        }
    }
    var rollOut = '<span style="text-align: center; vertical-align: text-middle; display: inline-block; min-width: 1.75em; border-radius: ' + InlineBorderRadius + 'px; padding: 2px 2px 0px 2px; ' + InlineColorOverride + '" title="Rolling ' + inlineroll.expression + ' = ' + values.join("");
    rollOut += '" class="a inlinerollresult showtip tipsy-n';
    rollOut += (critCheck && failCheck) ? ' importantroll' : (critCheck ? ' fullcrit' : (failCheck ? ' fullfail' : ''));
    rollOut += '">' + inlineroll.results.total + '</span>';
    return rollOut;
  }

  function processRoll(roll, critRoll, failRoll, highRoll, lowRoll, noHighlight) {
    if (roll.type === "C") {
      return {
        value: " " + roll.text + " "
      };
    } else if (roll.type === "L") {
      if (roll.text.indexOf("HR") != -1) highRoll = parseInt(roll.text.substring(2));
      else highRoll = false;
      if (roll.text.indexOf("LR") != -1) lowRoll = parseInt(roll.text.substring(2));
      else lowRoll = false;
      if (roll.text.indexOf("NH") != -1) {
        // Blocks highlight on an individual roll...
        noHighlight = true;
      }
      // Remove inline tags to reduce clutter...
      roll.text = roll.text.replace(/HR(\d+)/g, "");
      roll.text = roll.text.replace(/LR(\d+)/g, "");
      roll.text = roll.text.replace(/NH/g, "");
      if (roll.text !== "") roll.text = " [" + roll.text + "] ";
      return {
        value: roll.text,
        highRoll: highRoll,
        lowRoll: lowRoll,
        noHighlight: noHighlight
      };
    } else if (roll.type === "M") {
      roll.expr = roll.expr.toString().replace(/\+/g, " + ");
      return {
        value: roll.expr
      };
    } else if (roll.type === "R") {
      var rollValues = [];
      roll.results.forEach(function(result) {
        if (result.tableItem !== undefined) {
          rollValues.push(result.tableItem.name);
        } else {
          // Turn off highlighting if true...
          if (noHighlight) {
            critRoll = false;
            failRoll = false;
          } else {
            if (_.has(roll, 'mods') && _.has(roll.mods, 'customCrit')) {
              switch (roll.mods.customCrit[0].comp) {
                case '=':
                case '==':
                  critRoll = (result.v == roll.mods.customCrit[0].point);
                  break;
                case '>=':
                case '=>':
                case '>':
                  critRoll = (result.v >= roll.mods.customCrit[0].point);
                  break;
                default:
                  critRoll =
                    (highRoll !== false && result.v >= highRoll ||
                      result.v === roll.sides);
              }
            } else {
              critRoll =
                (highRoll !== false && result.v >= highRoll ||
                  result.v === roll.sides);
            }
            failRoll =
              (!critRoll &&
                (lowRoll !== false && result.v <= lowRoll || result.v === 1));
          }
          result.v = "<span class='basicdiceroll" + (critRoll ? ' critsuccess' : (failRoll ? ' critfail' : '')) + "'>" + result.v + "</span>";
          rollValues.push(result.v);
        }
      });
      return {
        value: "(" + rollValues.join(" + ") + ")",
        critRoll: critRoll,
        failRoll: failRoll,
        highRoll: highRoll,
        lowRoll: lowRoll,
        noHighlight: noHighlight
      };
    } else if (roll.type === "G") {
      var grollVal = [];
      roll.rolls.forEach(function(groll) {
        groll.forEach(function(groll2) {
          var result = processRoll(groll2, highRoll, lowRoll, noHighlight);
          grollVal.push(result.value);
          critRoll = critRoll || result.critRoll;
          failRoll = failRoll || result.failRoll;
          highRoll = highRoll || result.highRoll;
          lowRoll = lowRoll || result.lowRoll;
          noHighlight = noHighlight || result.noHighlight;
        });
      });
      return {
        value: "{" + grollVal.join(" ") + "}",
        critRoll: critRoll,
        failRoll: failRoll,
        highRoll: highRoll,
        lowRoll: lowRoll,
        noHighlight: noHighlight
      };
    }
  }

  function getBrightness(hex) {
    hex = hex.replace('#', '');
    var c_r = hexDec(hex.substr(0, 2));
    var c_g = hexDec(hex.substr(2, 2));
    var c_b = hexDec(hex.substr(4, 2));
    return ((c_r * 299) + (c_g * 587) + (c_b * 114)) / 1000;
  }

  function hexDec(hex_string) {
    hex_string = (hex_string + '').replace(/[^a-f0-9]/gi, '');
    return parseInt(hex_string, 16);
  }

  function addOrigin(name, toEvaluate) {
    return toEvaluate.replace(/@{/g, "@{" + name + "|");
  }

  function getPortee(charId, weaponPrefix) {
    var res = getAttrByName(charId, weaponPrefix + "armeportee");
    if (res === undefined) return 0;
    res = parseInt(res);
    if (isNaN(res) || res <= 0) return 0;
    return res;
  }

  function tokenCenter(tok) {
    return [tok.get("left"), tok.get("top")];
  }

  // if token is bigger then thresh reduce the distance by that size
  function tokenSize(tok, thresh) {
    var size = tok.get('width');
    var h = tok.get('height');
    if (h > size) size = h;
    if (size > thresh) return ((size - thresh) / 2);
    return 0;
  }

  function distanceCombat(tok1, tok2, pageId) {
    if (pageId === undefined) {
      pageId = tok1.get('pageid');
    }
    var PIX_PER_UNIT = 70;
    var page = getObj("page", pageId);
    var scale = page.get('scale_number');
    var pt1 = tokenCenter(tok1);
    var pt2 = tokenCenter(tok2);
    var distance_pix = VecMath.length(VecMath.vec(pt1, pt2));
    distance_pix -= tokenSize(tok1, PIX_PER_UNIT);
    distance_pix -= tokenSize(tok2, PIX_PER_UNIT);
    if (distance_pix < PIX_PER_UNIT * 1.5) return 0; //cases voisines
    return ((distance_pix / PIX_PER_UNIT) * scale);
  }


  function malusDistance(tok1, charId1, tok2, portee, pageId, ignoreObstacles) {
    var distance = distanceCombat(tok1, tok2, pageId);
    if (distance === 0) return {
      malus: 0,
      distance: 0
    };
    if (distance > 2 * portee) return {
      malus: "hp",
      distance: distance
    };
    var mPortee = (distance <= portee) ? 0 : (Math.ceil(5 * (distance - portee) / portee));
    var explications = [];
    if (mPortee > 0) {
      explications.push("Distance > " + portee + " m => malus -" + mPortee);
    }
    if (ignoreObstacles || attributeAsBool(charId1, 'joliCoup', false))
      return {
        malus: mPortee,
        explications: explications,
        distance: distance
      };
    // Now determine if any token is between tok1 and tok2
    var allToks =
      findObjs({
        _type: "graphic",
        _pageid: pageId,
        _subtype: "token",
        layer: "objects"
      });
    var mObstacle = 0;
    var PIX_PER_UNIT = 70;
    var pt1 = tokenCenter(tok1);
    var pt2 = tokenCenter(tok2);
    var distance_pix = VecMath.length(VecMath.vec(pt1, pt2));
    allToks.forEach(function(obj) {
      if (obj == tok1 || obj == tok2) return;
      if (getState(obj, 'mort') || getState(obj, 'assome') ||
        getState(obj, 'endormi')) return;
      var pt = tokenCenter(obj);
      var obj_dist = VecMath.length(VecMath.vec(pt1, pt));
      if (obj_dist > distance_pix) return;
      obj_dist = VecMath.length(VecMath.vec(pt2, pt));
      if (obj_dist > distance_pix) return;
      var distToTrajectory = VecMath.ptSegDist(pt, pt1, pt2);
      if (distToTrajectory > PIX_PER_UNIT + tokenSize(obj, PIX_PER_UNIT)) return;
      log("Obstacle trouvé : " + obj.get("name"));
      mObstacle += Math.ceil(5 * (PIX_PER_UNIT - distToTrajectory) / PIX_PER_UNIT);
    });
    if (mObstacle > 5) mObstacle = 5;
    var res = mPortee + mObstacle;
    if (mObstacle > 0) {
      explications.push("Obstacles sur le trajet => malus -" + mObstacle);
    }
    return {
      malus: res,
      explications: explications,
      distance: distance
    };
  }

  // Returns all attributes in attrs, with name name or starting with name_
  function allAttributesNamed(attrs, name) {
    var nameExt = name + '_';
    return attrs.filter(function(obj) {
      var attrName = obj.get('name');
      return (name == attrName || attrName.startsWith(nameExt));
    });
  }

  function removeAllAttributes(name, evt) {
    var attrs = findObjs({
      _type: 'attribute'
    });
    attrs = allAttributesNamed(attrs, name);
    if (attrs.length === 0) return;
    if (evt.deletedAttributes === undefined) evt.deletedAttributes = [];
    attrs.forEach(function(attr) {
      var v = attr.get('current');
      if (v) {
        evt.deletedAttributes.push(attr);
        attr.remove();
      }
    });
  }

  //Met tous les attributs avec le nom au max
  function resetAttr(attrs, attrName, evt, msg) {
    allAttributesNamed(attrs, attrName).forEach(function(att) {
      var vm = parseInt(att.get("max"));
      if (!isNaN(vm)) {
        var vc = parseInt(att.get("current"));
        if (vc != vm) {
          evt.attributes.push({
            attribute: att,
            current: vc
          });
          att.set("current", vm);
          if (msg) {
            var charId = att.get('characterid');
            var character = getObj('character', charId);
            var name = character.get('name');
            sendChar(charId, "/w " + name + " " + msg);
          }
        }
      }
    });
  }

  function sortirDuCombat() {
    if (!state.COFantasy.combat) {
      log("Pas en combat");
      return;
    }
    sendChat("GM", "Le combat est terminé");
    var evt = {
      type: 'fin_combat',
      initiativepage: Campaign().get('initiativepage'),
      turnorder: Campaign().get('turnorder'),
      attributes: [],
      combat: true,
      tour: state.COFantasy.tour,
      init: state.COFantasy.init,
      deletedAttributes: []
    };
    state.COFantasy.combat = false;
    setActiveToken(undefined, evt);
    Campaign().set('initiativepage', false);
    // Fin des effets qui durent pour le combat
    removeAllAttributes('armureMagique', evt);
    removeAllAttributes('soinsDeGroupe', evt);
    removeAllAttributes('sergentUtilise', evt);
    removeAllAttributes('enflamme', evt);
    removeAllAttributes('protegerUnAllie', evt);
    removeAllAttributes('protegePar', evt);
    // Autres attributs, on prend attrs l'ensemble des attributs
    var attrs = findObjs({
      _type: 'attribute'
    });
    // Remettre le pacifisme au max
    resetAttr(attrs, 'pacifisme', evt, "retrouve son pacifisme");
    // Remettre le traquenard à 1
    resetAttr(attrs, 'traquenard', evt);
    // Tout le monde recharge ses armes après un combat, non ?
    resetAttr(attrs, 'charge', evt, "recharge ses armes");
    // Et on récupère les munitions récupérables
    resetAttr(attrs, 'munition', evt, "récupère ses munitions");
    // Remettre défier la mort à 10
    resetAttr(attrs, 'defierLaMort', evt);
    //Effet de ignorerLaDouleur
    var ilds = allAttributesNamed(attrs, 'ignorerLaDouleur');
    ilds.forEach(function(ild) {
      var douleur = parseInt(ild.get('current'));
      if (isNaN(douleur)) {
        error("La douleur ignorée n'est pas un nombre", douleur);
        return;
      }
      var charId = ild.get('characterid');
      if (charId === undefined || charId === '') {
        error("Attribut sans personnage", ild);
        return;
      }
      var ildName = ild.get('name');
      if (ildName == 'ignorerLaDouleur') {
        var pvAttr = findObjs({
          _type: 'attribute',
          _characterid: charId,
          name: 'PV'
        });
        if (pvAttr.length === 0) {
          error("Personnage sans PV ", charId);
          return;
        }
        pvAttr = pvAttr[0];
        var pv = parseInt(pvAttr.get('current'));
        if (isNaN(pv)) {
          error("PV mal formés ", pvAttr);
          return;
        }
        evt.attributes.push({
          attribute: pvAttr,
          current: pv
        });
        var newPv = pv - douleur;
        if (newPv < 0) newPv = 0;
        pvAttr.set('current', newPv);
        if (pv > 0 && newPv === 0) {
          sendChar(charId, "s'écroule. Il semble sans vie. La douleur qu'il avait ignorée l'a finalement rattrapé...");
        } else {
          var tempDmg = attributeAsInt(charId, 'DMTEMP', 0);
          if (pv > tempDmg && newPv <= tempDmg) {
            sendChar(charId, "s'écroule, assomé. La douleur qu'il avait ignorée l'a finalement rattrapé...");
          } else {
            sendChar(charId, "subit le contrecoup de la douleur qu'il avait ignorée");
          }
        }
      } else { // ignorer la douleur d'un token 
        var tokName = ildName.substring(ildName.indexOf('_') + 1);
        var tokensIld = findObjs({
          _type: 'graphic',
          _subtype: 'token',
          represents: charId,
          name: tokName
        });
        if (tokensIld.length === 0) {
          error("Pas de token nommé " + tokName + " qui aurait ignoré la douleur", ild);
          return;
        }
        if (tokensIld.length > 1) {
          sendChar(charId, "a plusieurs tokens nommés " + tokName + ". Un seul d'entre eux subira l'effet d'ignorer la douleur");
        }
        var tokPv = parseInt(tokensIld[0].get('bar1_value'));
        var tokNewPv = tokPv - douleur;
        if (tokNewPv < 0) tokNewPv = 0;
        evt.affectes.push({
          affecte: tokensIld[0],
          prev: {
            bar1_value: tokPv
          }
        });
        updateCurrentBar(tokensIld[0], 1, tokNewPv);
        //TODO: faire mourrir, assomer
      }
    }); // end forEach on all attributes ignorerLaDouleur
    ilds.forEach(function(ild) {
      evt.deletedAttributes.push(ild);
      ild.remove();
    });
    // fin des effets temporaires (durée en tours)
    attrs = attrs.filter(function(obj) {
      var attrName = obj.get('name');
      if (estEffetTemp(attrName)) {
        var effet = effetOfAttribute(obj);
        if (effet == 'agrandissement') {
          var charId = obj.get('characterid');
          evt.affectes = evt.affectes || [];
          getObj('character', charId).get('defaulttoken', function(normalToken) {
            normalToken = JSON.parse(normalToken);
            var largeWidth = normalToken.width + normalToken.width / 2;
            var largeHeight = normalToken.height + normalToken.height / 2;
            iterTokensOfEffet(charId, effet, attrName, function(token) {
                var width = token.get('width');
                var height = token.get('height');
                evt.affectes.push({
                  affecte: token,
                  prev: {
                    width: width,
                    height: height
                  }
                });
                token.set('width', normalToken.width);
                token.set('height', normalToken.height);
              },
              function(token) {
                if (token.get('width') == largeWidth) return true;
                if (token.get('height') == largeHeight) return true;
                return false;
              }
            );
          });
        }
        return true;
      }
      return false;
    });
    attrs.forEach(function(attr) {
      evt.deletedAttributes.push(attr);
      attr.remove();
    });
    addEvent(evt);
  }

  function tokensNamed(names, pageId) {
    var tokens = findObjs({
      _type: 'graphic',
      _subtype: 'token',
      _pageid: pageId,
      layer: 'objects'
    });
    tokens = tokens.filter(function(obj) {
      var tokCharId = obj.get('represents');
      if (tokCharId === undefined) return false;
      var tokChar = getObj('character', tokCharId);
      if (tokChar === undefined) return false;
      var i = names.indexOf(tokChar.get('name'));
      return (i >= 0);
    });
    return tokens;
  }

  function getSelected(msg, callback) {
    var pageId;
    if (msg.who.endsWith("(GM)")) {
      var player = getObj('player', msg.playerid);
      pageId = player.get('lastpage');
    }
    if (pageId === undefined || pageId === "") {
      var pages = Campaign().get('playerspecificpages');
      if (pages && pages[msg.playerid] !== undefined) {
        pageId = pages[msg.playerid];
      } else {
        pageId = Campaign().get('playerpageid');
      }
    }
    var args = msg.content.split(' --');
    var selected = [];
    var count = args.length - 1;
    if (args.length > 1) {
      args.shift();
      args.forEach(function(cmd) {
        count--;
        switch (cmd.split(' ', 1)[0]) {
          case 'equipe':
            var nomEquipe = 'Equipe' + cmd.substring(cmd.indexOf(' '));
            var equipes = findObjs({
              _type: 'handout',
              name: nomEquipe
            });
            if (equipes.length === 0) {
              error(nomEquipe + " inconnue", msg.content);
              return;
            }
            if (equipes.length > 1) {
              error("Plus d'une " + nomEquipe, cmd);
            }
            count += equipes.length;
            equipes.forEach(function(equipe) {
              equipe.get('notes', function(note) {
                var names = note.split('<br>');
                var tokens = tokensNamed(names, pageId);
                if (tokens.length === 0) {
                  error("Pas de token de l'" + nomEquipe + " sur la page");
                }
                tokens.forEach(function(tok) {
                  selected.push({
                    _id: tok.id
                  });
                });
                count--;
                if (count === 0) callback(selected);
                return;
              });
            });
            return;
          case 'allies':
            // First get the acting token (in msg.selected)
            if (msg.selected === undefined || msg.selected.length === 0) {
              error("Pas d'allié car pas de token sélectionné", msg);
              return;
            }
            var activeNames = [];
            iterSelected(msg.selected, function(token, charId) {
              var character = getObj('character', charId);
              activeNames.push(character.get('name'));
            });
            var toutesEquipes = findObjs({
              _type: 'handout'
            });
            toutesEquipes = toutesEquipes.filter(function(obj) {
              return (obj.get('name').startsWith("Equipe "));
            });
            count += toutesEquipes.length;
            toutesEquipes.forEach(function(equipe) {
              equipe.get('notes', function(note) {
                count--;
                var names = note.split('<br>');
                var allie = names.some(function(n) {
                  return (activeNames.indexOf(n) >= 0);
                });
                if (allie) {
                  names = names.filter(function(n) {
                    return (activeNames.indexOf(n) < 0);
                  });
                  var tokens = tokensNamed(names, pageId);
                  tokens.forEach(function(tok) {
                    selected.push({
                      _id: tok.id
                    });
                  });
                }
                if (count === 0) callback(selected);
                return;
              });
            }); //end toutesEquipes.forEach
            return;
          case 'self':
            if (msg.selected === undefined) return;
            msg.selected.forEach(function(obj) {
              var inSelf = selected.findIndex(function(o) {
                return (o._id == obj._id);
              });
              if (inSelf < 0) selected.push(obj);
            });
            return;
          case 'target':
            var cmdSplit = cmd.split(' ');
            if (cmdSplit.length < 2) {
              error("Il manque l'id de la cible (après --target)", cmd);
              return;
            }
            selected.push({
              _id: cmdSplit[1]
            });
            return;
          default:
        }
      });
    }
    if (count === 0) {
      if (selected.length === 0) {
        if (_.has(msg, 'selected')) {
          callback(msg.selected);
          return;
        }
        callback([]);
        return;
      }
      callback(selected);
      return;
    }
  }


  function pointsDeRecuperation(charId) {
    // retourne les nombre de PR restant
    var pr = 5;
    var x;
    for (var i = 1; i < 6; i++) {
      x = getAttrByName(charId, "PR" + i);
      if (x == 1) pr--;
    }
    return pr;
  }

  function enleverPointDeRecuperation(charId) {
    for (var i = 1; i < 6; i++) {
      var prAttr = findObjs({
        _type: 'attribute',
        _characterid: charId,
        name: "PR" + i
      });
      if (prAttr.length === 0) {
        prAttr = createObj("attribute", {
          characterid: charId,
          name: "PR" + i,
          current: 1,
          max: 1
        });
        return {
          attribute: prAttr,
          current: null
        };
      } else if (prAttr[0].get('current') == 0) { // jshint ignore:line
        prAttr[0].set("current", 1);
        return {
          attribute: prAttr[0],
          current: 0
        };
      }
    }
    sendChat("COF", "Plus de point de récupération à enlever");
  }

  function rajouterPointDeRecuperation(charId) {
    for (var i = 1; i < 6; i++) {
      var prAttr =
        findObjs({
          _type: "attribute",
          _characterid: charId,
          name: "PR" + i
        });
      if (prAttr.length > 0 && prAttr[0].get("current") == 1) {
        prAttr[0].set("current", 0);
        return {
          attribute: prAttr[0],
          current: 1
        };
      }
    }
    log("Pas de point de récupération à récupérer pour " + charId);
  }

  // Récupération pour tous les tokens sélectionnés
  function nuit(msg) {
    if (state.COFantasy.combat) sortirDuCombat();
    var sel;
    if (_.has(msg, "selected")) {
      sel = _.map(msg.selected, function(tokId) {
        return tokId._id;
      });
    } else { //select all token. valid tokens will be filtered by recuperation
      var page = Campaign().get("playerpageid");
      var tokens =
        findObjs({
          t_ype: 'graphic',
          _subtype: 'token',
          layer: 'objects',
          _pageid: page
        });
      sel = _.map(tokens, function(obj) {
        return obj.id;
      });
    }
    recuperation(sel, "nuit");
  }

  // Remise à zéro de toutes les limites journalières
  function jour(evt) {
    removeAllAttributes('pressionMortelle', evt);
    removeAllAttributes('soinsLegers', evt);
    removeAllAttributes('soinsModeres', evt);
    removeAllAttributes('fortifie', evt);
    removeAllAttributes('baieMagique', evt);
  }

  function recuperer(msg) {
    if (state.COFantasy.combat) {
      sendChat("", "/w " + msg.who + " impossible de se reposer en combat");
      return;
    }
    if (!_.has(msg, "selected")) {
      sendChat("COF", "/w " + msg.who + " !cof-recuperer sans sélection de tokens");
      log("!cof-recuperer requiert des tokens sélectionnés");
      return;
    }
    var sel = _.map(msg.selected, function(tokId) {
      return tokId._id;
    });
    recuperation(sel, "recuperer");
  }

  function recuperation(selection, option) {
    if (option != "nuit" && option != "recuperer") {
      log("Wrong option " + option + " for recuperation");
      return;
    }
    var evt = {
      type: "recuperation",
      affectes: [],
      attributes: []
    };
    if (option == 'nuit') jour(evt);
    selection.forEach(function(tokId) {
      var token = getObj('graphic', tokId);
      if (token === undefined) return;
      var charId = token.get('represents');
      if (charId === undefined || charId === "") return;
      if (getState(token, 'mort', charId)) return;
      var character = getObj("character", charId);
      var characterName = character.get("name");
      var pr = pointsDeRecuperation(charId);
      var bar2 = parseInt(token.get("bar2_value"));
      var tokEvt = {
        affecte: token,
        prev: {}
      };
      var manaAttr = findObjs({
        _type: 'attribute',
        _characterid: charId,
        name: 'PM'
      });
      var hasMana = false;
      var dmTemp = bar2;
      if (manaAttr.length > 0) { // Récupération des points de mana
        var manaMax = parseInt(manaAttr[0].get('max'));
        hasMana = !isNaN(manaMax) && manaMax > 0;
        if (hasMana) {
          dmTemp = attributeAsInt(charId, 'DMTEMP', 0, token);
          if (option == 'nuit' && (isNaN(bar2) || bar2 < manaMax)) {
            tokEvt.prev.bar2_value = bar2;
            updateCurrentBar(token, 2, manaMax);
          }
        }
      }
      if (!isNaN(dmTemp) && dmTemp > 0) { // récupération de DM temp
        if (option == "nuit") dmTemp = 0;
        else dmTemp = Math.max(0, dmTemp - 10);
        if (hasMana) {
          setTokenAttr(token, charId, 'DMTEMP', dmTemp, evt);
        } else {
          tokEvt.prev.bar2_value = bar2;
          updateCurrentBar(token, 2, dmTemp);
        }
      }
      var dVie = attributeAsInt(charId, "DV", 0);
      if (dVie < 4) {
        if (tokEvt.prev != {}) evt.affectes.push(tokEvt);
        return; //Si pas de dé de vie, alors pas de PR.
      }
      var message;
      if (option == "nuit" && pr < 5) { // on récupère un PR
        var affAttr = rajouterPointDeRecuperation(charId);
        if (affAttr === undefined) {
          error("Pas de point de récupérartion à rajouter et pourtant pas au max", token);
          return;
        }
        evt.attributes.push(affAttr);
        evt.affectes.push(tokEvt);
        message =
          "Au cours de la nuit, les points de récupération de " + characterName +
          " passent de " + pr + " à " + (pr + 1);
        sendChat("", message);
        return;
      }
      var bar1 = parseInt(token.get("bar1_value"));
      var pvmax = parseInt(token.get("bar1_max"));
      if (isNaN(bar1) || isNaN(pvmax)) return;
      if (bar1 >= pvmax) {
        if (option == "recuperer") {
          sendChat("", characterName + " n'a pas besoin de repos");
        }
        return;
      }
      if (option == "recuperer") {
        if (pr === 0) { //pas possible de récupérer
          message = characterName + " a besoin d'une nuite complète pour récupérer";
          sendChat("", message);
          return;
        } else { //dépense d'un PR
          evt.attributes.push(enleverPointDeRecuperation(charId));
          pr--;
        }
      }
      var conMod = modCarac(charId, 'CONSTITUTION');
      var niveau = attributeAsInt(charId, 'NIVEAU', 1);
      var rollExpr = addOrigin(characterName, "[[1d" + dVie + "]]");
      sendChat("COF", rollExpr, function(res) {
        var rolls = res[0];
        var dVieRoll = rolls.inlinerolls[0].results.total;
        var bonus = conMod + niveau;
        var total = dVieRoll + bonus;
        if (total < 0) total = 0;
        tokEvt.prev.bar1_value = bar1;
        evt.affectes.push(tokEvt);
        bar1 += total;
        if (bar1 > pvmax) bar1 = pvmax;
        updateCurrentBar(token, 1, bar1);
        if (option == "nuit") {
          message = "Au cours de la nuit, ";
        } else {
          message = "Après une dizaine de minutes de repos, ";
        }
        message +=
          characterName + " récupère " + buildinline(rolls.inlinerolls[0]) + "+" + bonus + " PV. Il lui reste " + pr + " points de récupération";
        sendChat("", "/direct " + message);
      });
    });
    addEvent(evt);
  }

  function iterSelected(selected, iter, callback) {
    selected.forEach(function(sel) {
      var token = getObj('graphic', sel._id);
      if (token === undefined) {
        if (callback !== undefined) callback();
        return;
      }
      var charId = token.get('represents');
      if (charId === undefined || charId === "") {
        if (callback !== undefined) callback();
        return;
      }
      iter(token, charId);
    });
  }

  function recharger(msg) {
    if (!_.has(msg, "selected")) {
      sendChat("COF", "/w " + msg.who + " !cof-recharger sans sélection de tokens");
      log("!cof-recharger requiert des tokens sélectionnés");
      return;
    }
    var cmd = msg.content.split(" ");
    if (cmd.length < 2) {
      error("La fonction !cof-recharger attend au moins un argument", msg);
      return;
    }
    var attackLabel = cmd[1];
    var evt = {
      type: 'recharger',
      attributes: []
    };
    iterSelected(msg.selected, function(token, charId) {
      var name = token.get('name');
      var attrs =
        findObjs({
          _type: 'attribute',
          _characterid: charId,
          name: "charge_" + attackLabel
        });
      if (attrs.length < 1) {
        log("Personnage " + name + " sans charge " + attackLabel);
        return;
      }
      attrs = attrs[0];
      var att = getAttack(attackLabel, name, charId);
      if (att === undefined) {
        //  error("Arme "+attackLabel+" n'existe pas pour "+name, charId);
        return;
      }
      var weaponName = att.weaponName;
      var maxCharge = parseInt(attrs.get('max'));
      if (isNaN(maxCharge)) {
        error("max charge mal formée", attrs);
        return;
      }
      var currentCharge = parseInt(attrs.get('current'));
      if (isNaN(currentCharge)) {
        error("charge mal formée", attrs);
        return;
      }
      if (currentCharge < maxCharge) {
        evt.attributes.push({
          attribute: attrs,
          current: currentCharge
        });
        attrs.set('current', currentCharge + 1);
        updateNextInit(token);
        sendChar(charId, "recharge " + weaponName);
        return;
      }
      sendChar(charId, "a déjà tous ses " + weaponName + " chargés");
    });
    addEvent(evt);
  }

  function chance(msg) {
    if (!_.has(msg, "selected")) {
      sendChat("COF", "/w " + msg.who + " !cof-chance sans sélection de token");
      log("!cof-chance requiert de sélectionner un token");
      return;
    } else if (msg.selected.length != 1) {
      sendChat("COF", "/w " + msg.who + " !cof-chance ne doit selectionner qu'un token");
      log("!cof-chance requiert de sélectionner exactement un token");
      return;
    }
    var cmd = msg.content.split(" ");
    if (cmd.length < 2 || (cmd[1] != "combat" && cmd[1] != "autre")) {
      error("La fonction !cof-chance attend au moins un argument (combat ou autre)", msg);
      return;
    }
    var tokenId = msg.selected[0]._id;
    var token = getObj('graphic', tokenId);
    if (token === undefined) return;
    var charId = token.get('represents');
    if (charId === undefined || charId === "") {
      sendChat("COF", "/w " + msg.who + " !cof-chance ne fonctionne qu'avec des tokens qui représentent des personnages");
      log("!cof-chance d'un token ne représentant pas un personnage");
      log(token);
      return;
    }
    var name = token.get('name');
    var attaque;
    if (cmd[1] == 'combat') { //further checks
      var lastAct = lastEvent();
      if (lastAct !== undefined) {
        if (lastAct.type == 'failure') {
          attaque = lastAct.action;
        }
      }
      if (attaque === undefined || attaque.type != 'attaque' ||
        attaque.token_id != tokenId) {
        error("Pas de dernière action de combat ratée trouvée pour " + name, attaque);
        return;
      }
    }
    var chanceAttr = findObjs({
      _type: 'attribute',
      _characterid: charId,
      name: 'PC'
    });
    if (chanceAttr.length != 1) {
      error("Pas d'attribut de chance", chanceAttr);
      return;
    }
    chanceAttr = chanceAttr[0];
    var chance = chanceAttr.get('current');
    chance = parseInt(chance);
    if (isNaN(chance) || chance <= 0) {
      sendChat("", name + " n'a plus de point de chance à dépenser...");
      return;
    }
    var evt = {
      type: 'chance',
      attributes: [{
        attribute: chanceAttr,
        current: chance
      }]
    };
    chance = chance - 1;
    chanceAttr.set('current', chance);
    sendChat("", name + " a dépensé un point de chance. Il lui en reste " + chance);
    switch (cmd[1]) {
      case 'autre':
        addEvent(evt);
        return;
      case 'combat':
        chanceCombat(token, attaque, evt);
        return;
      default:
        error("argument de chance inconnu", cmd);
        addEvent(evt);
        return;
    }
  }

  function chanceCombat(token, a, evt) {
    // first undo the failure
    undoEvent();
    // then re-attack with bonus
    var options = a.options;
    options.chance = (options.chance + 10) || 10;
    options.rolls = a.rolls;
    options.evt = evt;
    attack(a.player_id, token, a.target_token, a.attack_label, options);
  }

  function intercepter(msg) {
    var cmd = msg.content.split(' ');
    if (cmd.length < 2) {
      error("Pour !cof-intercepter, il faut préciser l'id du token qui intercepte: ", msg.content);
      return;
    }
    var token = getObj("graphic", cmd[1]);
    if (token === undefined) {
      error("L'argument de !cof-intercepter n'est pas une id de token valide", msg.content);
      return;
    }
    var charId = token.get('represents');
    if (charId === '') {
      error("L'argument de !cof-intercepter doit représenter un personnage", token);
      return;
    }
    if (attributeAsBool(charId, 'intercepter', false, token)) {
      sendChar(charId, " a déjà intercepté une attaque ce tour");
      return;
    }
    var voieMeneur = attributeAsInt(charId, "voieDuMeneurDHomme", 0);
    if (voieMeneur < 2) {
      error(token.get('name') + " n'a pas un rang suffisant dans la voie du meneur d'homme pour intercepter l'attaque", voieMeneur);
      return;
    }
    var attaque;
    var lastAct = lastEvent();
    if (lastAct !== undefined) {
      attaque = lastAct.action;
    }
    if (attaque === undefined || attaque.type != 'attaque') {
      sendChar(charId, "la dernière action trouvée n'est pas une attaque, impossible d'intercepter");
      return;
    }
    var targetName = attaque.target_token.get('name');
    if (targetName === undefined) {
      error("Le token de la dernière attaque est indéfini", attaque);
      return;
    }
    if (distanceCombat(token, attaque.target_token) > 0) {
      sendChar(charId, " est trop loin de " + targetName + " pour intercepter l'attaque");
      return;
    }
    var evt = {
      type: 'interception'
    };
    setTokenAttr(token, charId, 'intercepter', true, evt, "se met devant " + targetName + " pour intercepter l'attaque !");
    // On annule l'ancienne action
    undoEvent();
    // Puis on refait en changeant la cible
    var options = attaque.options;
    options.intercepter = voieMeneur;
    options.rolls = attaque.rolls;
    options.evt = evt;
    attack(attaque.player_id, attaque.attacking_token, token, attaque.attack_label, options);
  }

  function exemplaire(msg) {
    var cmd = msg.content.split(' ');
    if (cmd.length < 2) {
      error("Pour !cof-exemplaire, il faut préciser l'id du token qui est exemplaire: ", msg.content);
      return;
    }
    var token = getObj("graphic", cmd[1]);
    if (token === undefined) {
      error("L'argument de !cof-exemplaire n'est pas une id de token valide", msg.content);
      return;
    }
    var charId = token.get('represents');
    if (charId === '') {
      error("L'argument de !cof-exemplaire doit représenter un personnage", token);
      return;
    }
    if (attributeAsBool(charId, 'exemplaire', false, token)) {
      sendChar(charId, " a déjà montré l'exemple à ce tour");
      return;
    }
    var attaque;
    var lastAct = lastEvent();
    if (lastAct !== undefined) {
      if (lastAct.type == 'failure') {
        attaque = lastAct.action;
      }
    }
    if (attaque === undefined || attaque.type != 'attaque') {
      sendChar(charId, "la dernière action trouvée n'est pas une attaque ratée, impossible de montrer l'exemple");
      return;
    }
    var attackerName = attaque.attacking_token.get('name');
    if (attackerName === undefined) {
      error("Le token de la dernière attaque est indéfini", attaque);
      return;
    }
    var evt = {
      type: "montrer l'exemple"
    };
    setTokenAttr(token, charId, 'exemplaire', true, evt,
      "montre l'exemple à " + attackerName);
    // On annule l'ancienne action
    undoEvent();
    // Puis on refait 
    var options = attaque.options;
    options.evt = evt;
    attack(attaque.player_id, attaque.attacking_token, attaque.target_token, attaque.attack_label, options);
  }

  function surprise(msg) {
    getSelected(msg, function(selected) {
      if (selected.length === 0) {
        sendChat("COF", "/w " + msg.who + " !cof-surprise sans sélection de token");
        log("!cof-surprise requiert de sélectionner des tokens");
        return;
      }
      var cmd = msg.content.split(" ");
      var testSurprise;
      if (cmd.length > 1) {
        testSurprise = parseInt(cmd[1]);
        if (isNaN(testSurprise)) testSurprise = undefined;
      }
      var display;
      if (testSurprise === undefined) {
        display = startFramedDisplay(msg.playerid, "<b>Surprise !</b>");
      } else {
        display = startFramedDisplay(msg.playerid, "Test de surprise difficulté " + testSurprise);
      }
      var evt = {
        type: 'surprise',
        affectes: []
      };
      var tokensToProcess = selected.length;
      var sendEvent = function() {
        if (tokensToProcess == 1) {
          addEvent(evt);
          sendChat("", endFramedDisplay(display));
        }
        tokensToProcess--;
      };
      iterSelected(selected, function(token, charId) {
        if (!isActive(token)) {
          sendEvent();
          return;
        }
        var name = token.get('name');
        if (testSurprise !== undefined) {
          testCaracteristique(charId, 'SAG', ['vigilance', 'perception'],
            testSurprise, token,
            function(reussite, rolltext) {
              var result;
              if (reussite) result = "réussi";
              else {
                result = "raté, " + name + " est surpris";
                result += eForFemale(charId);
                setState(token, 'surpris', true, evt, charId);
              }
              var message = name + " fait " + rolltext + " : " + result;
              addLineToFramedDisplay(display, message);
              sendEvent();
            });
        } else { //no test
          setState(token, 'surpris', true, evt, charId);
          addLineToFramedDisplay(display, name + " est surpris." + eForFemale(charId));
          sendEvent();
        }
      }, sendEvent);
    });
  }

  function isActive(token) {
    var inactif =
      getState(token, 'mort') || getState(token, 'surpris') ||
      getState(token, 'assome') || getState(token, 'etourdi') ||
      getState(token, 'paralyse') || getState(token, 'endormi') ||
      getState(token, 'apeure');
    return !inactif;
  }

  function interchangeable(attackingToken, token, charId, pageId) { //détermine si il y a assez de tokens 
    var res = {
      result: false,
      targets: []
    };
    if (!isActive(token)) return res;
    var meuteAttr =
      findObjs({
        _type: 'attribute',
        _characterid: charId,
        name: 'interchangeable'
      });
    if (meuteAttr.length < 1) return res;
    meuteAttr = parseInt(meuteAttr[0].get('current'));
    if (isNaN(meuteAttr) || meuteAttr <= 0) return res;
    var tokens = findObjs({
      _type: 'graphic',
      _subtype: 'token',
      represents: charId,
      _pageid: pageId
    });
    tokens = tokens.filter(isActive);
    res.result = (tokens.length > meuteAttr);
    // Now select the tokens which could be valid targets
    var p = distanceCombat(attackingToken, token);
    if (p === 0) { //cible au contact, on garde toutes celles au contact
      res.targets = tokens.filter(function(tok) {
        var d = distanceCombat(attackingToken, tok);
        return (d === 0);
      });
    } else { // cible à distance, on garde celles au contact de la cible
      res.targets = tokens.filter(function(tok) {
        var d = distanceCombat(token, tok);
        return (d === 0);
      });
    }
    return res;
  }

  function setActiveToken(tokenId, evt) {
    evt.affectes = evt.affectes || [];
    if (state.COFantasy.activeTokenId) {
      if (tokenId == state.COFantasy.activeTokenId) return;
      var prevToken = getObj('graphic', state.COFantasy.activeTokenId);
      if (prevToken) {
        evt.affectes.push({
          affecte: prevToken,
          prev: {
            statusmarkers: prevToken.get('statusmarkers')
          }
        });
        prevToken.set('status_flying-flag', false);
      } else {
        var pageId = Campaign().get('initiativepage');
        if (pageId) {
          prevToken = findObjs({
            _type: 'graphic',
            _subtype: 'token',
            layer: 'objects',
            _pageid: pageId,
            name: state.COFantasy.activeTokenName
          });
        } else {
          prevToken = findObjs({
            _type: 'graphic',
            _subtype: 'token',
            layer: 'objects',
            name: state.COFantasy.activeTokenName
          });
        }
        prevToken.forEach(function(o) {
          evt.affectes.push({
            affecte: o,
            prev: {
              statusmarkers: o.get('statusmarkers')
            }
          });
          o.set('status_flying-flag', false);
        });
      }
    }
    if (tokenId) {
      var token = getObj('graphic', tokenId);
      if (token) {
        evt.affectes.push({
          affecte: token,
          prev: {
            statusmarkers: token.get('statusmarkers')
          }
        });
        token.set('status_flying-flag', true);
        state.COFantasy.activeTokenId = tokenId;
        state.COFantasy.activeTokenName = token.get('name');
      } else {
        error("Impossible de trouver le token dont c'est le tour", tokenId);
        state.COFantasy.activeTokenId = undefined;
      }
    }
  }



  function getTurnOrder(evt) {
    var turnOrder = Campaign().get('turnorder');
    evt.turnorder = evt.turnorder || turnOrder;
    if (turnOrder === "") {
      turnOrder = [{
        id: "-1",
        pr: 1,
        custom: "Tour",
        formula: "+1"
      }];
      evt.tour = state.COFantasy.tour;
      state.COFantasy.tour = 1;
    } else {
      turnOrder = JSON.parse(turnOrder);
    }
    var indexTour = turnOrder.findIndex(function(elt) {
      return (elt.id == "-1" && elt.custom == "Tour");
    });
    if (indexTour == -1) {
      indexTour = turnOrder.length;
      turnOrder.push({
        id: "-1",
        pr: 1,
        custom: "Tour",
        formula: "+1"
      });
      evt.tour = state.COFantasy.tour;
      state.COFantasy.tour = 1;
    }
    var res = {
      tour: turnOrder[indexTour],
      pasAgi: turnOrder.slice(0, indexTour),
      dejaAgi: turnOrder.slice(indexTour + 1, turnOrder.length)
    };
    return res;
  }

  function initiative(selected, evt) { //set initiative for selected tokens
    // Always called when entering combat mode
    // set the initiative counter, if not yet set
    // Assumption: all tokens that have not acted yet are those before the turn 
    // counter.
    // When initiative for token not present, assumes it has not acted
    // When present, stays in same group, but update position according to
    // current initiative.
    // Tokens appearing before the turn are sorted
    if (!Campaign().get('initiativepage')) evt.initiativepage = false;
    if (!state.COFantasy.combat) { //actions de début de combat
      evt.combat = false;
      evt.combat_pageid = state.COFantasy.combat_pageid;
      state.COFantasy.combat = true;
      Campaign().set({
        turnorder: JSON.stringify([{
          id: "-1",
          pr: 1,
          custom: "Tour",
          formula: "+1"
        }]),
        initiativepage: true
      });
      evt.tour = state.COFantasy.tour;
      state.COFantasy.tour = 1;
      evt.init = state.COFantasy.init;
      state.COFantasy.init = 1000;
      removeAllAttributes('transeDeGuérison', evt);
    }
    if (!Campaign().get('initiativepage')) {
      Campaign().set('initiativepage', true);
    }
    var to = getTurnOrder(evt);
    if (to.pasAgi.length === 0) { // Fin de tour, on met le tour à la fin et on retrie
      to.pasAgi = to.dejaAgi;
      to.dejaAgi = [];
    }
    iterSelected(selected, function(token, charId) {
      state.COFantasy.combat_pageid = token.get('pageid');
      if (!isActive(token)) return;
      var init = tokenInit(token, charId);
      // On place le token à sa place dans la liste du tour
      var dejaIndex =
        to.dejaAgi.findIndex(function(elt) {
          return (elt.id == token.id);
        });
      if (dejaIndex == -1) {
        to.pasAgi =
          to.pasAgi.filter(function(elt) {
            return (elt.id != token.id);
          });
        to.pasAgi.push({
          id: token.id,
          pr: init,
          custom: ''
        });
      } else {
        to.dejaAgi[dejaIndex].pr = init;
      }
    });
    setTurnOrder(to, evt);
  }

  function setTurnOrder(to, evt) {
    if (to.pasAgi.length > 0) {
      to.pasAgi.sort(function(a, b) {
        if (a.id == "-1") return 1;
        if (b.id == "-1") return -1;
        if (a.pr < b.pr) return 1;
        if (b.pr < a.pr) return -1;
        var tokenA = getObj('graphic', a.id);
        if (tokenA === undefined) return 1;
        var tokenB = getObj('graphic', b.id);
        if (tokenB === undefined) return -1;
        var charIdA = tokenA.get('represents');
        if (charIdA === '') return 1;
        var charIdB = tokenB.get('represents');
        if (charIdB === '') return -1;
        //Priorité aux joueurs (qui ont un DV) sur les PNJs
        var dvA = attributeAsInt(charIdA, "DV", 0);
        var dvB = attributeAsInt(charIdB, "DV", 0);
        if (dvA === 0) {
          if (dvB === 0) return 0;
          return 1;
        }
        if (dvB === 0) return -1;
        //Entre joueurs, priorité à la plus grosse sagesse
        var sagA = attributeAsInt(charIdA, 'SAGESSE', 10);
        var sagB = attributeAsInt(charIdB, 'SAGESSE', 10);
        if (sagA < sagB) return 1;
        if (sagB > sagA) return -1;
        return 0;
      });
      setActiveToken(to.pasAgi[0].id, evt);
    }
    to.pasAgi.push(to.tour);
    var turnOrder = to.pasAgi.concat(to.dejaAgi);
    Campaign().set('turnorder', JSON.stringify(turnOrder));
  }

  function attendreInit(msg) {
    if (!_.has(msg, 'selected')) {
      error("La fonction !cof-attendre : rien à faire, pas de token selectionné", msg);
      return;
    }
    var cmd = msg.content.split(' ');
    if (cmd.length < 2) {
      error("Attendre jusqu'à quelle initiative ?", cmd);
      return;
    }
    var newInit = parseInt(cmd[1]);
    if (isNaN(newInit) || newInit < 1) {
      error("On ne peut attendre que jusqu'à une initiative de 1", cmd);
      newInit = 0;
    }
    var evt = {
      type: "attente"
    };
    var to = getTurnOrder(evt);
    iterSelected(msg.selected, function(token, charId) {
      if (!isActive(token)) return;
      var tokenPos =
        to.pasAgi.findIndex(function(elt) {
          return (elt.id == token.id);
        });
      if (tokenPos == -1) { // token ne peut plus agir
        sendChar(charId, " a déjà agit ce tour");
        return;
      }
      if (newInit < to.pasAgi[tokenPos].pr) {
        to.pasAgi[tokenPos].pr = newInit;
        sendChar(charId, " attend un peu avant d'agir...");
        updateNextInit(token);
      } else {
        sendChar(charId, " a déjà une initiative inférieure à " + newInit);
      }
    });
    setTurnOrder(to, evt);
    addEvent(evt);
  }

  function statut(msg) { // show some character informations
    if (!_.has(msg, 'selected')) {
      error("Dans !cof-status : rien à faire, pas de token selectionné", msg);
      return;
    }
    var playerId = msg.playerid;
    iterSelected(msg.selected, function(token, charId) {
      var name = token.get('name');
      var character = getObj('character', charId);
      var display =
        startFramedDisplay(playerId, "État de " + name, character, 20);
      var line =
        "Points de vie    : " + token.get('bar1_value') + " / " +
        getAttrByName(charId, 'PV', 'max');
      addLineToFramedDisplay(display, line);
      var manaAttr = findObjs({
        _type: 'attribute',
        _characterid: charId,
        name: 'PM'
      });
      var hasMana = false;
      if (manaAttr.length > 0) {
        var manaMax = parseInt(manaAttr[0].get('max'));
        hasMana = !isNaN(manaMax) && manaMax > 0;
      }
      var dmTemp = parseInt(token.get('bar2_value'));
      if (hasMana) {
        var mana = dmTemp;
        if (token.get('bar1_link') !== "") mana = manaAttr[0].get('current');
        line = "Points de mana   : " + mana + " / " + manaAttr[0].get('max');
        addLineToFramedDisplay(display, line);
        dmTemp = attributeAsInt(charId, 'DMTEMP', 0, token);
      } else if (token.get('bar1_link') !== "") {
        dmTemp = attributeAsInt(charId, 'DMTEMP', 0);
      }
      if (!isNaN(dmTemp) && dmTemp > 0) {
        line = "Dommages temporaires : " + dmTemp;
        addLineToFramedDisplay(display, line);
      }
      var aDV = attributeAsInt(charId, 'DV', 0);
      if (aDV > 0) { // correspond aux PJs
        line =
          "Points de récupération : " + pointsDeRecuperation(charId) + " / 5";
        addLineToFramedDisplay(display, line);
        line =
          "Points de chance : " + getAttrByName(charId, 'PC') + " / " +
          (3 + modCarac(charId, 'CHARISME'));
        addLineToFramedDisplay(display, line);
        var pacifisme =
          findObjs({
            _type: "attribute",
            _characterid: charId,
            name: "pacifisme"
          });
        if (pacifisme.length > 0) {
          pacifisme = parseInt(pacifisme[0].get('current'));
          if (!isNaN(pacifisme)) {
            if (pacifisme > 0) addLineToFramedDisplay(display, "Pacifisme actif");
            else addLineToFramedDisplay(display, "Pacifisme non actif");
          }
        }
      }
      var attrsChar = findObjs({
        _type: 'attribute',
        _characterid: charId
      });
      var attrsArmes = attrsChar.filter(function(attr) {
        var attrName = attr.get('name');
        return (attrName.startsWith("repeating_armes_") &&
          attrName.endsWith("_armenom"));
      });
      attrsArmes.forEach(function(attr) {
        var nomArme = attr.get('current');
        var armeLabel = nomArme.split(' ', 1)[0];
        nomArme = nomArme.substring(nomArme.indexOf(' ') + 1);
        var charge =
          findObjs({
            _type: "attribute",
            _characterid: charId,
            name: "charge_" + armeLabel
          });
        if (charge.length > 0) {
          charge = parseInt(charge[0].get('current'));
          if (!isNaN(charge)) {
            if (charge === 0) {
              line = nomArme + " n'est pas chargé";
            } else if (charge == 1) {
              line = nomArme + " est chargé";
            } else if (charge > 1) {
              line = nomArme + " contient encore " + charge + " charges";
            }
            var enMain =
              findObjs({
                _type: "attribute",
                _characterid: charId,
                name: "initEnMain" + armeLabel
              });
            if (enMain.length > 0) {
              enMain = parseInt(enMain[0].get('current'));
              if (!isNaN(enMain)) {
                if (enMain === 0) line += ", pas en main";
                else if (enMain > 0) line += " et en main";
              }
            }
            addLineToFramedDisplay(display, line);
          }
        }
      });
      var armureM = attributeAsInt(charId, 'armureMagique', 0, token);
      if (armureM > 0)
        addLineToFramedDisplay(display, "Protégé" + eForFemale(charId) + " par une armure magique");
      if (attributeAsInt(charId, 'enflamme', 0, token))
        addLineToFramedDisplay(display, "en flammes");
      var bufDef = attributeAsInt(charId, 'bufDEF', 0, token);
      if (bufDef > 0)
        addLineToFramedDisplay(display, "Défense temporairement modifiée de " + bufDef);
      for (var etat in cof_states) {
        if (getState(token, etat, charId))
          addLineToFramedDisplay(display, etat + eForFemale(charId));
      }
      if (attributeAsInt(charId, 'DEFARMUREON', 1) === 0) {
        addLineToFramedDisplay(display, "Ne porte pas son armure");
        if (attributeAsInt(charId, 'vetementsSacres', 0) > 0)
          addLineToFramedDisplay(display, "  mais bénéficie de ses vêtements sacrés");
        if (attributeAsInt(charId, 'armureDeVent', 0) > 0)
          addLineToFramedDisplay(display, "  mais bénéficie de son armure de vent");
      }
      if (attributeAsInt(charId, 'DEFBOUCLIERON', 1) === 0)
        addLineToFramedDisplay(display, "Ne porte pas son bouclier");
      for (var effet in messageEffets) {
        var effetActif = false;
        if (effet == 'forgeron') {
          if (findObjs({
              _type: 'attribute',
              _characterid: charId
            }).findIndex(function(attr) {
              return (attr.get('name').startsWith('forgeron_'));
            }) >= 0)
            effetActif = true;
        } else effetActif = attributeAsBool(charId, effet, false, token);
        if (effetActif)
          addLineToFramedDisplay(display, messageEffets[effet].actif);
      }
      allAttributesNamed(attrsChar, 'munition').forEach(function(attr) {
        var attrName = attr.get('name');
        var underscore = attrName.indexOf('_');
        if (underscore < 0 || underscore == attrName.length - 1) return;
        var munitionNom = attrName.substring(underscore + 1).replace(/_/g, ' ');
        addLineToFramedDisplay(display, munitionNom + " : " + attr.get('current') + " / " + attr.get('max'));
      });
      sendChat("", endFramedDisplay(display));
    });
  }

  function removeFromTurnTracker(tokenId, evt) {
    var turnOrder = Campaign().get('turnorder');
    if (turnOrder === "" || !state.COFantasy.combat) {
      return;
    }
    evt.turnorder = evt.turnorder || turnOrder;
    turnOrder = JSON.parse(turnOrder).filter(
      function(elt) {
        return (elt.id != tokenId);
      });
    Campaign().set('turnorder', JSON.stringify(turnOrder));
  }

  function updateCurrentBar(token, barNumber, val) {
    var attrId = token.get("bar" + barNumber + "_link");
    if (attrId === "") {
      token.set("bar" + barNumber + "_value", val);
      return;
    }
    var attr = getObj('attribute', attrId);
    attr.set('current', val);
    return;
  }

  function eForFemale(charId) {
    return onGenre(charId, '', 'e');
  }

  function onGenre(charId, male, female) {
    var sex = getAttrByName(charId, 'SEXE');
    if (sex.startsWith('F')) return female;
    return male;
  }

  function setTokenAttr(token, charId, attribute, value, evt, msg, maxval) {
    if (msg !== undefined) {
      sendChar(charId, msg);
    }
    evt.attributes = evt.attributes || [];
    var agrandir = false;
    if (attribute == 'agrandissement') agrandir = true;
    // check if the token is linked to the character. If not, use token name
    // in attribute name (token ids don't persist over API reload)
    var link = token.get('bar1_link');
    if (link === "") attribute += "_" + token.get('name');
    var attr = findObjs({
      _type: 'attribute',
      _characterid: charId,
      name: attribute
    });
    if (attr.length === 0) {
      if (maxval === undefined) maxval = '';
      attr = createObj('attribute', {
        characterid: charId,
        name: attribute,
        current: value,
        max: maxval
      });
      evt.attributes.push({
        attribute: attr,
        current: null
      });
      if (agrandir) {
        var width = token.get('width');
        var height = token.get('height');
        evt.affectes = evt.affectes || [];
        evt.affectes.push({
          affecte: token,
          prev: {
            width: width,
            height: height
          }
        });
        width += width / 2;
        height += height / 2;
        token.set('width', width);
        token.set('height', height);
      }
      return;
    }
    attr = attr[0];
    evt.attributes.push({
      attribute: attr,
      current: attr.get('current'),
      max: attr.get('max')
    });
    attr.set('current', value);
    if (maxval !== undefined) attr.set('max', maxval);
  }

  function setAttr(selected, attribute, value, evt, msg, maxval) {
    if (selected === undefined || selected.length === 0) return [];
    iterSelected(selected, function(token, charId) {
      setTokenAttr(token, charId, attribute, value, evt, msg, maxval);
    });
  }

  function removeTokenAttr(token, charId, attribute, evt, msg) {
    if (msg !== undefined) {
      sendChar(charId, msg);
    }
    // check if the token is linked to the character. If not, use token name
    // in attribute name (token ids don't persist over API reload)
    var link = token.get('bar1_link');
    if (link === '') attribute += "_" + token.get('name');
    var attr = findObjs({
      _type: 'attribute',
      _characterid: charId,
      name: attribute
    });
    if (attr.length === 0) return;
    attr = attr[0];
    evt.deletedAttributes = evt.deletedAttributes || [];
    evt.deletedAttributes.push(attr);
    attr.remove();
  }

  function removeAttr(selected, attribute, evt, msg) {
    if (selected === undefined || selected.length === 0) return [];
    iterSelected(selected, function(token, charId) {
      removeTokenAttr(token, charId, attribute, evt, msg);
    });
  }

  function tokenAttribute(charId, name, token) {
    if (token !== undefined) {
      var link = token.get('bar1_link');
      if (link === "") name += "_" + token.get('name');
    }
    return findObjs({
      _type: 'attribute',
      _characterid: charId,
      name: name
    });
  }

  // Caution : does not work with repeating attributes!!!!
  // Caution not to use token when the attribute should not be token dependant
  function attributeAsInt(charId, name, def, token) {
    var attr = tokenAttribute(charId, name, token);
    if (attr.length === 0) return def;
    attr = parseInt(attr[0].get('current'));
    if (isNaN(attr)) return def;
    return attr;
  }

  function attributeAsBool(charId, name, def, token) {
    if (def === undefined) def = false;
    var attr = tokenAttribute(charId, name, token);
    if (attr.length === 0) return def;
    attr = attr[0].get('current');
    if (attr == 'true') return true;
    if (attr === 'false' || attr === false) return false;
    return true;
  }


  function armureMagique(msg) {
    var evt = {
      type: 'other'
    };
    setAttr(msg.selected, 'armureMagique', 1, evt, "est entouré d'un halo magique");
    if (evt.attributes.length === 0) {
      error("Pas de cible valide sélectionnée pour !cod-armure-magique", msg);
      return;
    }
    addEvent(evt);
  }

  function bufDef(msg) {
    var cmd = msg.content.split(' ');
    if (cmd.length < 2) {
      error("La fonction !cof-buf-def attend un argument", cmd);
      return;
    }
    var buf = parseInt(cmd[1]);
    if (isNaN(buf)) {
      error("Argument de !cof-bu-def invalide", cmd);
      return;
    }
    if (buf === 0) return;
    var message = "";
    if (buf > 0) message = "voit sa défense augmenter";
    else message = "voit sa défense baisser";
    var evt = {
      type: 'other'
    };
    getSelected(msg, function(selected) {
      setAttr(selected, 'bufDEF', buf, evt, message);
      if (evt.attributes.length === 0) {
        error("Pas de cible valide sélectionnée pour !cod-buf-def", msg);
        return;
      }
      addEvent(evt);
    });
  }

  function removeBufDef(msg) {
    var evt = {
      type: 'other'
    };
    getSelected(msg, function(selected) {
      removeAttr(selected, 'bufDEF', evt, "retrouve sa défense normale");
      if (evt.deletedAttributes.length === 0) {
        error("Pas de cible valide sélectionnée pour !cod-remove-buf-def", msg);
        return;
      }
      addEvent(evt);
    });
  }

  function bonusTestCarac(carac, charId, token) {
    var bonus = attributeAsInt(charId, carac + "_BONUS", 0);
    if (attributeAsBool(charId, 'chant_des_heros', false, token)) {
      bonus += 1;
    }
    if (attributeAsBool(charId, 'benediction', false, token)) {
      bonus += 1;
    }
    if (carac == 'DEX') {
      if (attributeAsInt(charId, 'DEFARMUREON', 1))
        bonus -= attributeAsInt(charId, 'DEFARMUREMALUS', 0);
      if (attributeAsInt(charId, 'DEFBOUCLIERON', 1))
        bonus -= attributeAsInt(charId, 'DEFBOUCLIERMALUS', 0);
      if (attributeAsBool(charId, 'agrandissement', false, token))
        bonus -= 2;
    }
    if (carac == 'FOR') {
      if (attributeAsBool(charId, 'rayon_affaiblissant', false, token))
        bonus -= 2;
      if (attributeAsBool(charId, 'agrandissement', false, token))
        bonus += 2;
    }
    return bonus;
  }

  function nbreDeTestCarac(carac, charId) {
    return attributeAsInt(charId, carac + "_SUP", 1);
  }

  function deTestCarac(carac, charId, token) {
    var dice = 20;
    if (getState(token, 'affaibli', charId)) dice = 12;
    return dice;
  }

  function testCaracteristique(charId, carac, bonusAttrs, seuil, token, callback) { //asynchrone
    var bonus = bonusTestCarac(carac, charId, token);
    bonusAttrs.forEach(function(attr) {
      bonus += attributeAsInt(charId, attr, 0);
    });
    if (carac == 'SAG' || carac == 'INT' || carac == 'CHA') {
      if (attributeAsBool(charId, 'sansEsprit', false)) {
        callback(true, "(sans esprit : réussite automatique)");
        return;
      }
    }
    var carSup = nbreDeTestCarac(carac, charId);
    var dice = deTestCarac(carac, charId, token);
    if (getState(token, 'affaibli', charId)) dice = 12;
    var rollExpr = "[[{" + carSup + "d" + dice + "cs20cf1}kh1]]";
    var name = getObj('character', charId).get('name');
    var carTest = addOrigin(name, getAttrByName(charId, carac));
    var toEvaluate = rollExpr + " [[" + carTest + "]]";
    sendChat("", toEvaluate, function(res) {
      var rolls = res[0];
      // Determine which roll number correspond to which expression
      var afterEvaluate = rolls.content.split(" ");
      var d20RollNumber;
      var carTestNumber;
      for (var i = 0; i < afterEvaluate.length; i++) {
        switch (parseInt(afterEvaluate[i][3])) {
          case 0:
            d20RollNumber = i;
            break;
          case 1:
            carTestNumber = i;
            break;
          default:
            error("Cannot recognize roll number", afterEvaluate);
        }
      }
      var d20roll = rolls.inlinerolls[d20RollNumber].results.total;
      bonus += rolls.inlinerolls[carTestNumber].results.total;
      var bonusText = (bonus > 0) ? "+" + bonus : (bonus === 0) ? "" : bonus;
      var rtext = buildinline(rolls.inlinerolls[d20RollNumber]) + bonusText;
      if (d20roll == 20 || d20roll + bonus >= seuil) callback(true, rtext);
      else callback(false, rtext);
    });
  }

  // Ne pas remplacer les inline rolls, il faut les afficher correctement
  function aoe(msg) {
    getSelected(msg, function(selected) {
      if (selected === undefined || selected.length === 0) {
        error("pas de cible pour l'aoe", msg);
        return;
      }
      var title = "<b>Dégats à aire d'effets.</b>";
      var optArgs = msg.content.split(' --');
      var cmd = optArgs[0].split(' ');
      if (cmd.length < 2) {
        error("cof-aoe prend les dégats en argument, avant les options",
          msg.content);
        return;
      }
      var dmg;
      var dmgRollNumber = findRollNumber(cmd[1]);
      if (dmgRollNumber === undefined) {
        dmg = {
          display: cmd[1],
          total: parseInt(cmd[1]),
          type: 'normal'
        };
        if (isNaN(dmg.total)) {
          error("Le premier argument de !cof-aoe n'est pas un nombre",
            msg.content);
          return;
        }
      } else {
        var r = msg.inlinerolls[dmgRollNumber];
        dmg = {
          total: r.results.total,
          display: buildinline(r, 'normal'),
          type: 'normal'
        };
        if (isNaN(dmg.total)) {
          error("Le premier argument de !cof-aoe n'est pas un nombre",
            msg.content);
          return;
        }
      }
      var partialSave;
      var options = {
        aoe: true
      };
      optArgs.forEach(function(opt) {
        opt = opt.split(' ');
        switch (opt[0]) {
          case '!cof-aoe':
            break;
          case 'psave':
            partialSave = opt;
            break;
          default:
            error("option de !cof-aoe inconnue :" + opt[0], optArgs);
        }
      });
      if (partialSave !== undefined) {
        if (partialSave.length < 3) {
          error("Usage : !cof-aoe dmg --psave carac seuil", partialSave);
          return;
        }
        if (isNotCarac(partialSave[1])) {
          error("Le premier argument de --psave n'est pas une caractéristique", partialSave);
          return;
        }
        options.partialSave = {
          carac: partialSave[1],
          seuil: parseInt(partialSave[2])
        };
        if (isNaN(options.partialSave.seuil)) {
          error("Le deuxième argument de --psave n'est pas un nombre", partialSave);
          return;
        }
        title +=
          " Jet de " + partialSave[1] + " difficulté " + partialSave[2] +
          " pour réduire les dégâts";
      }
      var display = startFramedDisplay(msg.playerid, title);
      var tokensToProcess = selected.length;
      var evt = {
        type: "aoe",
        affectes: []
      };

      function finalDisplay() {
        if (tokensToProcess == 1) {
          sendChat("", endFramedDisplay(display));
          if (evt.affectes.length > 0) addEvent(evt);
        }
        tokensToProcess--;
      }
      iterSelected(selected, function(token, charId) {
        var name = token.get('name');
        dealDamage(token, charId, dmg, evt, 1, options, undefined,
          function(dmgDisplay, saveResult, dmgFinal) {
            if (partialSave === undefined) {
              addLineToFramedDisplay(display,
                name + " reçoit " + dmgDisplay + " points de dégâts");
            } else {
              var message =
                name + " fait " + saveResult.display + ". " +
                onGenre(charId, 'Il', 'Elle');
              if (saveResult.success) {
                message += " ne reçoit que " + dmgDisplay + " points de dégâts";
              } else {
                message += " reçoit " + dmgDisplay + " points de dégâts";
              }
              addLineToFramedDisplay(display, message);
            }
            finalDisplay();
          });
      }, finalDisplay);
    });
  }

  function findRollNumber(msg) {
    if (msg.length > 4) {
      if (msg.substring(0, 3) == '$[[') {
        var res = rollNumber(msg);
        if (isNaN(res)) return undefined;
        return res;
      }
    }
    return undefined;
  }

  function isNotCarac(x) {
    return (x != 'FOR' && x != 'DEX' && x != 'CON' && x != 'SAG' && x != 'INT' && x != 'CHA');
  }

  function estElementaire(t) {
    if (t === undefined) return false;
    return (t == "feu" || t == "froid" || t == "acide" || t == "electrique");
  }

  function interfaceSetState(msg) {
    getSelected(msg, function(selected) {
      if (selected === undefined || selected.length === 0) {
        error("pas de cible pour le changement d'état", msg);
        return;
      }
      var cmd = msg.content.split(' ');
      if (cmd.length < 3) {
        error("Pas assez d'arguments pour !cof-set-state", msg.content);
        return;
      }
      var etat = cmd[1];
      var valeur = cmd[2];
      if (valeur == "false" || valeur == "0") valeur = false;
      if (valeur == "true") valeur = true;
      if (!_.has(cof_states, etat)) {
        error("Premier argument de !cof-set-state n'est pas un état valide", cmd);
        return;
      }
      var evt = {
        type: "set_state",
        affectes: []
      };
      iterSelected(selected, function(token, charId) {
        setState(token, etat, valeur, evt, charId);
      });
      addEvent(evt);
    });
  }

  function updateInit(token, evt) {
    if (state.COFantasy.combat &&
      token.get('pageid') == state.COFantasy.combat_pageid)
      initiative([{
        _id: token.id
      }], evt);
  }

  function updateNextInit(token) {
    updateNextInitSet.add(token.id);
  }

  function attributesInitEnMain(charId) {
    var attrs = findObjs({
      _type: 'attribute',
      _characterid: charId
    });
    attrs = attrs.filter(function(obj) {
      return (obj.get('name').startsWith('initEnMain'));
    });
    return attrs;
  }

  function labelInitEnMain(attr) {
    var attrN = attr.get('name').substring(10);
    return attrN;
  }

  function degainer(msg) {
    if (msg.selected === undefined || msg.selected.length === 0) {
      error("Qui doit dégainer ?", msg);
      return;
    }
    var cmd = msg.content.split(' ');
    if (cmd.length < 2) {
      error("Pas assez d'arguments pour !cof-degainer", msg.content);
      return;
    }
    var armeLabel = cmd[1];
    var evt = {
      type: "other",
      attributes: []
    };
    iterSelected(msg.selected, function(token, charId) {
      var name = token.get('name');
      var attrs = attributesInitEnMain(charId);
      attrs.forEach(function(attr) {
        var cur = parseInt(attr.get('current'));
        var attrN = labelInitEnMain(attr);
        var att = getAttack(attrN, name, charId);
        if (att === undefined) {
          error("Init en main avec un label introuvable dans les armes", attr);
          return;
        }
        var nomArme = att.weaponName;
        if (attrN == armeLabel) {
          if (cur === 0) {
            sendChar(charId, "dégaine " + nomArme);
            evt.attributes.push({
              attribute: attr,
              current: cur
            });
            attr.set('current', attr.get('max'));
            updateNextInit(token);
            return;
          }
          sendChar(charId, "a déjà " + nomArme + " en main");
          return;
        }
        if (cur !== 0) {
          sendChar(charId, "rengaine " + nomArme);
          evt.attributes.push({
            attribute: attr,
            current: cur
          });
          attr.set('current', 0);
        }
      });
    });
    if (evt.attributes.length > 0) addEvent(evt);
  }

  function echangeInit(msg) {
    var args = msg.content.split(" ");
    if (args.length < 4) {
      error("Not enough arguments to !cof-echange-init: " + msg.content, args);
      return;
    }
    var token1 = getObj("graphic", args[1]);
    if (token1 === undefined) {
      error("First argument is not a token: " + msg.content, args[1]);
      return;
    }
    var token2 = getObj("graphic", args[2]);
    if (token2 === undefined) {
      error("Second argument is not a token: " + msg.content, args[2]);
      return;
    }
    var attackBonus = parseInt(args[3]);
    if (isNaN(attackBonus) || attackBonus < 1 || attackBonus > 2) {
      error("Le troisième argument n'est pas un nombre " + msg.content, args[3]);
      return;
    }
    var charId1 = token1.get('represents');
    if (charId1 === "") {
      error("Le premier token sélectionné ne représente pas un personnage", token1);
      return;
    }
    var charId2 = token2.get('represents');
    if (charId2 === "") {
      sendChat(msg.who, "La cible sélectionée ne représente pas un personnage");
      return;
    }
    var evt = {
      type: "echange_init"
    };
    var to = getTurnOrder(evt);
    var tourTok1 = to.pasAgi.findIndex(function(t) {
      return (t.id == token1.id);
    });
    var tourTok2 = to.pasAgi.findIndex(function(t) {
      return (t.id == token2.id);
    });
    if (tourTok1 < 0) {
      sendChar(charId1, "a déjà agit, pas moyen d'échanger son initiative");
      return;
    }
    if (tourTok2 < 0) {
      sendChar(charId2, "a déjà agit, pas moyen d'échanger son initiative");
      return;
    }
    var pr1 = to.pasAgi[tourTok1].pr;
    var pr2 = to.pasAgi[tourTok2].pr;
    if (pr1 == pr2) {
      sendChar(charId1, "a la même initiative que " + token2.get('name'));
      return;
    }
    if (pr1 > pr2) {
      setTokenAttr(token1, charId1, 'actionConcertee', attackBonus, evt, "gagne un bonus de " + attackBonus + " à ses attaques et en DEF pour ce tour");
      addEvent(evt);
    }
    to.pasAgi[tourTok1].pr = pr2;
    to.pasAgi[tourTok2].pr = pr1;
    var t1 = to.pasAgi[tourTok1];
    to.pasAgi[tourTok1] = to.pasAgi[tourTok2];
    to.pasAgi[tourTok2] = t1;
    updateNextInit(token1);
    updateNextInit(token2);
    to.pasAgi.push(to.tour);
    var turnOrder = to.pasAgi.concat(to.dejaAgi);
    Campaign().set('turnorder', JSON.stringify(turnOrder));
    addEvent(evt);
  }

  function aCouvert(msg) {
    var args = msg.content.split(" ");
    if (args.length < 2) {
      error("Pas assez d'arguments pour !cof-a-couvert: " + msg.content, args);
      return;
    }
    var token1 = getObj("graphic", args[1]);
    if (token1 === undefined) {
      error("Le premier argument n'est pas un token: " + msg.content, args[1]);
      return;
    }
    var charId1 = token1.get('represents');
    if (charId1 === "") {
      error("Le token sélectionné ne correspond pas à un personnage", args);
      return;
    }
    var evt = {
      type: "a_couvert"
    };
    var init = getInit();
    setTokenAttr(token1, charId1, 'a_couvert', 1, evt, "reste à couvert", init);
    if (args.length > 2) {
      var token2 = getObj("graphic", args[2]);
      if (token2 !== undefined && token2.id != token1.id) {
        var charId2 = token2.get('represents');
        if (charId2 !== "" && charId2 != charId1) {
          var d = distanceCombat(token1, token2);
          if (d > 0) {
            sendChar(charId2, "est trop éloigné de " + token1.get('name') + " pour rester à couvert avec lui");
          } else {
            setTokenAttr(
              token2, charId2, 'a_couvert', 1, evt,
              "suit " + token1.get('name') + " et reste à couvert", init);
          }
        }
      }
    }
    addEvent(evt);
  }

  function getInit() {
    return state.COFantasy.init;
  }

  function effetTemporaire(msg) {
    var options = {};
    var pageId;
    if (msg.selected && msg.selected.length > 0) {
      var firstSelected = getObj('graphic', msg.selected[0]._id);
      pageId = firstSelected.get('pageid');
    }
    var opts = msg.content.split(' --');
    var cmd = opts.shift().split(' ');
    if (cmd.length < 3) {
      error("Pas assez d'arguments pour !cof-effet-temp", msg.content);
      return;
    }
    var effetComplet = cmd[1];
    var effet = cmd[1];
    if (effet.startsWith('forgeron_')) effet = 'forgeron';
    if (!estEffetTemp(effet)) {
      error(effet + " n'est pas un effet temporaire répertorié", msg.content);
      return;
    }
    var duree = parseInt(cmd[2]);
    if (isNaN(duree) || duree < 1) {
      error(
        "Le deuxième argument de !cof-effet-temp doit être un nombre positif",
        msg.content);
      return;
    }
    var evt = {
      type: 'effet_temp_' + effetComplet
    };
    opts.forEach(function(arg) {
      cmd = arg.split(' ');
      switch (cmd[0]) {
        case 'puissant':
          if (cmd.length < 2) {
            options.puissant = "on";
            return;
          }
          if (cmd[1] == "oui") {
            options.puissant = "on";
            return;
          }
          if (cmd[1] == "non") {
            options.puissant = "off";
            return;
          }
          error("Option puissant non reconnue", cmd);
          return;
        case "mana":
          if (cmd.length < 3) {
            error("Pas assez d'argument pour --mana id n", cmd);
            return;
          }
          var lanceur = tokenOfId(cmd[1], cmd[1], pageId);
          if (lanceur === undefined) {
            error("Premier argument de --mana non valide", cmd);
            return;
          }
          var cout = parseInt(cmd[2]);
          if (isNaN(cout) || cout < 0) {
            error("Cout en mana incorrect", cmd);
            return;
          }
          options.mana = {
            cout: cout,
            token: lanceur.token,
            charId: lanceur.charId
          };
          return;
        case "portee":
          if (cmd.length < 3) {
            error("Pas assez d'argument pour --portee id n", cmd);
            return;
          }
          var tokPortee = tokenOfId(cmd[1], cmd[1], pageId);
          if (tokPortee === undefined) {
            error("Premier argument de --portee non valide", cmd);
            return;
          }
          var portee = parseInt(cmd[2]);
          if (isNaN(portee) || portee < 0) {
            error("Portée incorrecte", cmd);
            return;
          }
          options.portee = {
            distance: portee,
            token: tokPortee.token,
            charId: tokPortee.charId
          };
          return;
        default:
          return;
      }
    });
    if (options.mana &&
      !depenseMana(
        options.mana.token, options.mana.charId, options.mana.cout, effet, evt)
    ) return;
    getSelected(msg, function(selected) {
      if (selected === undefined || selected.length === 0) {
        error("Pas de cible sélectionée pour l'effet", msg);
        return;
      }
      if (options.portee) {
        selected = selected.filter(function(sel) {
          var token = getObj('graphic', sel._id);
          var dist = distanceCombat(options.portee.token, token);
          if (dist > options.portee.distance) {
            sendChar(options.portee.charId, " est trop loin de sa cible");
            return false;
          }
          return true;
        });
      }
      if (!state.COFantasy.combat && selected.length > 0) {
        initiative(selected, evt);
      }
      setAttr(
        selected, effetComplet, duree, evt, messageEffets[effet].activation,
        getInit());
      if (options.puissant) {
        var puissant = true;
        if (options.puissant == "off") puissant = false;
        setAttr(selected, effetComplet + "Puissant", puissant, evt);
      }
      addEvent(evt);
    });
  }

  function peurOneToken(token, charId, pageId, difficulte, duree, options,
    display, evt, callback) {
    if (attributeAsBool(charId, 'sansPeur', false)) {
      addLineToFramedDisplay(display,
        token.get('name') + " est insensible à la peur !");
      callback();
      return;
    }
    //chercher si un partenaire a sansPeur pour appliquer le bonus
    var charName = getObj('character', charId).get('name');
    var toutesEquipes = findObjs({
      _type: 'handout'
    });
    toutesEquipes = toutesEquipes.filter(function(obj) {
      return (obj.get('name').startsWith("Equipe "));
    });
    var countEquipes = toutesEquipes.length;
    var allieSansPeur = 0;
    toutesEquipes.forEach(function(equipe) {
      equipe.get('notes', function(note) {
        countEquipes--;
        if (note.includes(charName)) {
          var names = note.split('<br>');
          var tokens = tokensNamed(names, pageId);
          tokens.forEach(function(tok) {
            var cid = tok.get('represents');
            if (cid === '') return;
            if (attributeAsBool(cid, 'sansPeur', false)) {
              allieSansPeur =
                Math.max(allieSansPeur, 2 + modCarac(cid, 'CHARISME'));
            }
          });
        }
        if (countEquipes === 0) { //continuation
          var seuil = difficulte - allieSansPeur;
          testCaracteristique(charId, 'SAG', [], seuil, token,
            function(reussite, rollText) {
              var line = "Jet de résistance de " + token.get('name') + ":" + rollText;
              var sujet = onGenre(charId, 'il', 'elle');
              if (reussite) {
                line += "&gt;=" + seuil + ",  " + sujet + " résiste à la peur.";
              } else {
                setState(token, 'apeure', true, evt, charId);
                line += "&lt;" + seuil + ", " + sujet + " s'enfuit";
                if (options.etourdi) {
                  line += " ou reste recroquevillé" + eForFemale(charId) + " sur place";
                  setTokenAttr(token, charId, 'peurEtourdi', duree, evt, undefined, getInit());
                } else {
                  setTokenAttr(token, charId, 'peur', duree, evt, undefined, getInit());
                }
              }
              addLineToFramedDisplay(display, line);
              callback();
            });
        }
      });
    }); //end toutesEquipes.forEach
    callback();
  }

  function peur(msg) {
    var optArgs = msg.content.split(' --');
    var cmd = optArgs[0].split(' ');
    if (cmd.length < 4) {
      error("Pas assez d'arguments pour !cof-peur", msg.content);
      return;
    }
    var casterTokenId = cmd[1];
    var casterToken = getObj('graphic', casterTokenId);
    if (!casterToken) {
      error("Le premier arguent de !cof-peur n'est pas un token valide", cmd);
      return;
    }
    var casterCharId = casterToken.get('represents');
    if (casterCharId === '') {
      error("Le premier arguent de !cof-peur n'est pas un token valide", casterToken);
      return;
    }
    var casterCharacter = getObj('character', casterCharId);
    var pageId = casterToken.get('pageid');
    var difficulte = parseInt(cmd[2]);
    if (isNaN(difficulte)) {
      error("Le second argument de !cof-peur, la difficulté du test de résitance, n'est pas un nombre", cmd);
      return;
    }
    var duree = parseInt(cmd[3]);
    if (isNaN(duree) || duree < 0) {
      error("Le troisième argument de !cof-peur, la durée, n'est pas un nombre positif", cmd);
      return;
    }
    var options = {};
    optArgs.shift();
    optArgs.forEach(function(opt) {
      var optCmd = opt.split(' ');
      switch (optCmd[0]) {
        case "attaqueMagique":
          error("TODO", opt);
          return;
        case "resisteAvecForce":
        case "etourdi":
        case "ralenti":
        case "effroi":
          options[optCmd[0]] = true;
          return;
        case "portee":
          if (optCmd.length < 2) {
            error("Il manque l'argument de portée", optArgs);
            return;
          }
          options.portee = parseInt(optCmd[1]);
          if (isNaN(options.portee) || options.portee < 0) {
            error("La portée n'est pas un nombre positif", optCmd);
            options.portee = undefined;
          }
          return;
        default:
          return;
      }
    });
    getSelected(msg, function(selected) {
      if (selected === undefined || selected.length === 0) {
        error("Pas de cible sélectionnée pour la peur", msg);
        return;
      }
      var titre = "<b>" + casterToken.get('name') + "</b> ";
      if (options.effroi)
        titre += "est vraiment effrayant" + eForFemale(casterCharId);
      else titre += "lance un sort de peur";
      var display = startFramedDisplay(msg.playerid, titre, casterCharacter);
      var evt = {
        type: 'peur'
      };
      var counter = selected.length;
      var finalEffect = function() {
        if (counter > 0) return;
        sendChat("", endFramedDisplay(display));
        addEvent(evt);
      };
      iterSelected(selected, function(token, charId) {
          counter--;
          if (options.portee !== undefined) {
            var m =
              malusDistance(casterToken, casterCharId, token, options.portee, pageId);
            if (isNaN(m.malus) || m.distance > options.portee) {
              addLineToFramedDisplay(display, token.get('name') + " est hors de portée de l'effet");
              finalEffect();
              return;
            }
          }
          peurOneToken(token, charId, pageId, difficulte, duree, options,
            display, evt, finalEffect);
        }, //fun fonction de iterSelectde
        function() { //callback pour les cas où token incorrect
          counter--;
          finalEffect();
        });
    });
  }


  function attaqueMagique(msg) {
    var args = msg.content.split(" ");
    if (args.length < 3) {
      error("Pas assez d'arguments pour !cof-attaque-magique: " + msg.content, args);
      return;
    }
    var token1 = getObj("graphic", args[1]);
    if (token1 === undefined) {
      error("Le premier argument n'est pas un token: " + msg.content, args[1]);
      return;
    }
    var charId1 = token1.get('represents');
    if (charId1 === "") {
      error("Le token sélectionné ne correspond pas à un personnage", args);
      return;
    }
    var char1 = getObj("character", charId1);
    if (char1 === undefined) {
      error("Unexpected undefined 1", token1);
      return;
    }
    var name1 = char1.get('name');
    var token2 = getObj("graphic", args[2]);
    if (token2 === undefined) {
      error("Le deuxième argument n'est pas un token: " + msg.content, args[2]);
      return;
    }
    var charId2 = token2.get('represents');
    if (charId2 === "") {
      error("Le token sélectionné ne correspond pas à un personnage", args);
      return;
    }
    var char2 = getObj("character", charId2);
    if (char2 === undefined) {
      error("Unexpected undefined 1", token2);
      return;
    }
    var name2 = char2.get('name');
    var explications = [];
    var evt = {
      type: 'attaque magique'
    };
    var bonus1 = bonusDAttaque(token1, charId1, explications, evt);
    if (bonus1 === 0) bonus1 = "";
    else if (bonus1 > 0) bonus1 = " +" + bonus1;
    var attk1 = addOrigin(name1, "[[" + getAttrByName(charId1, 'ATKMAG') +
      bonus1 + "]]");
    var bonus2 = bonusDAttaque(token2, charId2, explications, evt);
    if (bonus2 === 0) bonus2 = "";
    else if (bonus2 > 0) bonus2 = " +" + bonus2;
    var attk2 = addOrigin(name2, "[[" + getAttrByName(charId2, 'ATKMAG') +
      bonus1 + "]]");
    var dice1 = 20;
    if (getState(token1, 'affaibli', charId1)) dice1 = 12;
    var dice2 = 20;
    if (getState(token1, 'affaibli', charId1)) dice2 = 12;
    var toEvaluate = "[[1d" + dice1 + "]] [[1d" + dice2 + "]] " + attk1 + " " + attk2;
    sendChat("", toEvaluate, function(res) {
      var rolls = res[0];
      // Determine which roll number correspond to which expression
      var afterEvaluate = rolls.content.split(" ");
      var att1RollNumber = rollNumber(afterEvaluate[0]);
      var att2RollNumber = rollNumber(afterEvaluate[1]);
      var attk1SkillNumber = rollNumber(afterEvaluate[2]);
      var attk2SkillNumber = rollNumber(afterEvaluate[3]);
      var d20roll1 = rolls.inlinerolls[att1RollNumber].results.total;
      var att1Skill = rolls.inlinerolls[attk1SkillNumber].results.total;
      var attackRoll1 = d20roll1 + att1Skill;
      var d20roll2 = rolls.inlinerolls[att2RollNumber].results.total;
      var att2Skill = rolls.inlinerolls[attk2SkillNumber].results.total;
      var attackRoll2 = d20roll2 + att2Skill;
      var titre =
        "<b>" + token1.get('name') +
        "</b> tente une attaque magique opposée contre <b>" + token2.get('name') +
        "</b>";
      var display = startFramedDisplay(msg.playerid, titre, char1);
      var line =
        token1.get('name') + " fait " +
        buildinline(rolls.inlinerolls[att1RollNumber]);
      if (att1Skill > 0) line += "+" + att1Skill + " = " + attackRoll1;
      else if (att1Skill < 0) line += att1Skill + " = " + attackRoll1;
      addLineToFramedDisplay(display, line);
      line =
        token2.get('name') + " fait " +
        buildinline(rolls.inlinerolls[att2RollNumber]);
      if (att2Skill > 0) line += "+" + att2Skill + " = " + attackRoll2;
      else if (att2Skill < 0) line += att2Skill + " = " + attackRoll2;
      addLineToFramedDisplay(display, line);
      var reussi;
      if (d20roll1 == 1) {
        if (d20roll2 == 1) reussi = (attackRoll1 >= attackRoll2);
        else reussi = false;
      } else if (d20roll2 == 1) reussi = true;
      else if (d20roll1 == 20) {
        if (d20roll2 == 20) reussi = (attackRoll1 >= attackRoll2);
        else reussi = true;
      } else reussi = (attackRoll1 >= attackRoll2);
      if (reussi) addLineToFramedDisplay(display, "<b>Attaque réussie !</b>");
      else addLineToFramedDisplay(display, "<b>L'attaque échoue.</b>");
      sendChat("", endFramedDisplay(display));
      addEvent(evt);
    });
  }

  function findCharacter(name) {
    var charac = findObjs({
      _type: 'character',
      name: name
    });
    if (charac.length > 1)
      sendChat("COFantasy", "Il existe plusieurs personnages nommés " + name);
    if (charac.length > 0) return charac[0];
    charac = findObjs({
      _type: 'character'
    });
    charac = charac.filter(function(obj) {
      return (obj.get('name').startsWith(name));
    });
    if (charac.length > 1)
      sendChat("COFantasy", "Aucun personnage nommé " + name + ", mais plusieurs commençant par " + name + ". On choisi " + charac[0].get('name'));
    if (charac.length > 0) return charac[0];
    return undefined;
  }

  function sommeil(msg) { //sort de sommeil
    getSelected(msg, function(selected) {
      if (selected === undefined || selected.length === 0) {
        sendChat(msg.who, "Pas de cible sélectionnée pour le sort de sommeil");
        return;
      }
      // first argument is name of the spell caster
      var args = msg.content.split(' ');
      if (args.length < 2) {
        error("La fonction !cof-sommeil a besoin du nom du lanceur de sort", args);
        return;
      }
      var caster = findCharacter(args[1]);
      if (caster === undefined) {
        error("Aucun personnage nommé " + args[1], args);
        return;
      }
      var casterCharId = caster.id;
      var casterName = caster.get('name');
      var cha = modCarac(casterCharId, 'CHARISME');
      var attMagText = addOrigin(casterName, getAttrByName(casterCharId, 'ATKMAG'));
      var titre = "<b>" + casterName + "</b> lance un sort de sommeil";
      var display = startFramedDisplay(msg.playerid, titre, caster);
      sendChat("", "[[1d6]] [[" + attMagText + "]]", function(res) {
        var rolls = res[0];
        var afterEvaluate = rolls.content.split(" ");
        var d6RollNumber = rollNumber(afterEvaluate[0]);
        var attMagRollNumber = rollNumber(afterEvaluate[1]);
        var nbTargets = rolls.inlinerolls[d6RollNumber].results.total + cha;
        var attMag = rolls.inlinerolls[attMagRollNumber].results.total;
        var evt = {
          type: 'sommeil',
          affectes: []
        };
        var targetsWithSave = [];
        var targetsWithoutSave = [];
        iterSelected(selected, function(token, charId) {
          var tname = token.get('name');
          var pv = token.get('bar1_max');
          if (pv > 2 * attMag) {
            var line = tname + " a trop de PV pour être affecté par le sort";
            addLineToFramedDisplay(display, line);
          } else if (pv > attMag) {
            targetsWithSave.push({
              token: token,
              charId: charId,
              name: tname
            });
          } else {
            targetsWithoutSave.push({
              token: token,
              charId: charId,
              name: tname
            });
          }
        });
        var targets = [];
        var i, r;
        if (targetsWithoutSave.length > nbTargets) {
          i = 0; //position to decide
          while (nbTargets > 0) {
            r = randomInteger(nbTargets) + i;
            targets.push(targetsWithoutSave[r]);
            targetsWithoutSave[r] = targetsWithoutSave[i];
            i++;
            nbTargets--;
          }
        } else {
          targets = targetsWithoutSave;
          nbTargets -= targets.length;
        }
        targets.forEach(function(t) {
          setState(t.token, 'endormi', true, evt, t.charId);
          addLineToFramedDisplay(display, t.name + " s'endort");
        });
        if (nbTargets > 0 && targetsWithSave.length > 0) {
          if (targetsWithSave.length > nbTargets) {
            i = 0;
            targets = [];
            while (nbTargets > 0) {
              r = randomInteger(nbTargets) + i;
              targets.push(targetsWithSave[r]);
              targetsWithSave[r] = targetsWithSave[i];
              i++;
              nbTargets--;
            }
          } else {
            targets = targetsWithSave;
            nbTargets -= targets.length;
          }
          var seuil = 10 + cha;
          var tokensToProcess = targets.length;
          var sendEvent = function() {
            if (tokensToProcess == 1) {
              addEvent(evt);
              sendChat("", endFramedDisplay(display));
            }
            tokensToProcess--;
          };
          targets.forEach(function(t) {
            testCaracteristique(t.charId, 'SAG', [], seuil, t.token,
              function(reussite, rollText) {
                var line = "Jet de résistance de " + t.name + ":" + rollText;
                if (reussite) {
                  line += "&gt;=" + seuil + ",  il ne s'endort pas";
                } else {
                  setState(t.token, 'endormi', true, evt, t.charId);
                  line += "&lt;" + seuil + ", il s'endort";
                }
                addLineToFramedDisplay(display, line);
                sendEvent();
              });
          });
        } else { // all targets are without save
          addEvent(evt);
          sendChat("", endFramedDisplay(display));
        }
      });
    });
  }

  function transeGuerison(msg) {
    if (state.COFantasy.combat) {
      sendChat("", "Pas possible de méditer en combat");
      return;
    }
    if (msg.selected === undefined || msg.selected.length === 0) {
      sendChat(msg.who, "Pas de cible sélectionnée pour la transe de guérison");
      return;
    }
    var evt = {
      type: "Transe de guérison",
      affectes: []
    };
    iterSelected(msg.selected, function(token, charId) {
      if (attributeAsBool(charId, 'transeDeGuérison', false, token)) {
        sendChar(charId, "a déjà médité depuis le dernier combat");
        return;
      }
      var bar1 = parseInt(token.get("bar1_value"));
      var pvmax = parseInt(token.get("bar1_max"));
      if (isNaN(bar1) || isNaN(pvmax)) return;
      if (bar1 >= pvmax) {
        sendChar(charId, "n'a pas besoin de méditer");
        return;
      }
      var sagMod = modCarac(charId, 'SAGESSE');
      var niveau = attributeAsInt(charId, 'NIVEAU', 1);
      var soin = niveau + sagMod;
      if (soin < 0) soin = 0;
      evt.affectes.push({
        affecte: token,
        prev: {
          bar1_value: bar1
        }
      });
      bar1 += soin;
      if (bar1 > pvmax) {
        soin -= (bar1 - pvmax);
        bar1 = pvmax;
      }
      updateCurrentBar(token, 1, bar1);
      setTokenAttr(token, charId, 'transeDeGuérison', true, evt);
      sendChar(charId, "entre en méditation pendant 10 minutes et récupère " + soin + " points de vie.");
    });
    addEvent(evt);
  }

  // Look for a given string in the PROFIL attribute (case insensitive)
  // type should be all lower case
  function charOfType(charId, type) {
    var attr = findObjs({
      _type: 'attribute',
      _characterid: charId,
      name: 'PROFIL'
    });
    if (attr.length === 0) return false;
    var profil = attr[0].get('current').toLowerCase();
    return (profil.includes(type));
  }

  function raceIs(charId, race) {
    var attr = findObjs({
      _type: 'attribute',
      _characterid: charId,
      name: 'RACE'
    });
    if (attr.length === 0) return false;
    var charRace = attr[0].get('current').toLowerCase();
    return (charRace == race.toLowerCase());
  }

  function soin(msg) {
    var args = msg.content.split(" ");
    if (args.length < 4) {
      error("Pas assez d'arguments pour !cof-soin: " + msg.content, args);
      return;
    }
    var token1 = getObj("graphic", args[1]); // Le soigneur
    if (token1 === undefined) {
      error("Le premier argument n'est pas un token: " + msg.content, args[1]);
      return;
    }
    var charId1 = token1.get('represents');
    if (charId1 === "") {
      error("Le token sélectionné ne correspond pas à un personnage", args);
      return;
    }
    var pageId = token1.get('pageid');
    var target = tokenOfId(args[2], args[2], pageId);
    if (target === undefined) {
      error("Le deuxième argument n'est pas un token valide: " + msg.content, args[2]);
      return;
    }
    var token2 = target.token; // Le soigné
    var charId2 = target.charId;
    var name2 = token2.get('name');
    var indexPortee = msg.content.indexOf(' --portee');
    if (indexPortee > 0) { //Une portée est spécifiée
      var argPortee = msg.content.substring(indexPortee + 2);
      argPortee = argPortee.split(' ');
      if (argPortee.length < 2) {
        error("Il manque un argument à l'option --portee de !cof-soin", argPortee);
      } else {
        var portee = parseInt(argPortee[1]);
        if (isNaN(portee) || portee < 0) {
          error("L'argument portee doit être un entier positif", argPortee);
        } else {
          var m = malusDistance(token1, charId1, token2, portee, pageId, true);
          if (isNaN(m.malus) || m.distance > portee) {
            sendChar(charId1, "est trop loin de " + name2 + " pour le soigner");
            return;
          }
        }
      }
    }
    var callMax = function() {
      sendChar(charId1, "n'a pas besoin de soigner " + name2 + ". Il est déjà au maximum de PV");
      return;
    };
    var niveau = attributeAsInt(charId1, 'NIVEAU', 1);
    var rangSoin = attributeAsInt(charId1, 'voieDesSoins', 0);
    var evt = {
      type: 'soins'
    };
    var printTrue = function(soins) {
      sendChar(charId1, "soigne " + name2 + " de " + soins + " PV");
      addEvent(evt);
    };
    var callTrue = printTrue;
    var soins;
    switch (args[3]) {
      case 'leger':
        var nbLegers = attributeAsInt(charId1, 'soinsLegers', 0);
        if (nbLegers >= rangSoin) {
          sendChar(charId1, "ne peut plus lancer de sort de soins légers aujourd'hui");
          return;
        }
        callTrue = function(s) {
          setTokenAttr(token1, charId1, 'soinsLegers', nbLegers + 1, evt);
          printTrue(s);
        };
        soins = randomInteger(8) + niveau;
        break;
      case 'modere':
        if (rangSoin < 2) {
          sendChar(charId1, "n'a pas un rang suffisant dans la Voie des Soins pour lancer un sort de soins modérés");
          return;
        }
        var nbModeres = attributeAsInt(charId1, 'soinsModeres', 0);
        if (nbModeres >= rangSoin) {
          sendChar(charId1, "ne peut plus lancer de sort de soins modérés aujourd'hui");
          return;
        }
        callTrue = function(s) {
          setTokenAttr(token1, charId1, 'soinsModeres', nbModeres + 1, evt);
          printTrue(s);
        };
        soins = randomInteger(8) + randomInteger(8) + niveau;
        break;
      default:
        soins = parseInt(args[3]);
        if (isNaN(soins) || soins < 1) {
          error(
            "Le troisième argument de !cof-soin doit être un nombre positif",
            msg.content);
          return;
        }
    }
    if (soins <= 0) {
      sendChar(charId1, "ne réussit pas à soigner (total de soins " + soins + ")");
      return;
    }
    var pvSoigneur;
    var callTrueFinal = callTrue;
    if (msg.content.includes(' --transfer')) { //paie avec ses PV
      pvSoigneur = parseInt(token1.get("bar1_value"));
      if (isNaN(pvSoigneur) || pvSoigneur <= 0) {
        sendChar(charId1, "ne peut pas soigner " + name2 + ", il n'a plus de PV");
        return;
      }
      if (pvSoigneur < soins) {
        soins = pvSoigneur;
      }
      callTrueFinal = function(s) {
        evt.affectes.push({
          prev: {
            bar1_value: pvSoigneur
          },
          affecte: token1
        });
        updateCurrentBar(token1, 1, pvSoigneur - s);
        if (pvSoigneur == s) setState(token1, 'mort', true, evt, charId1);
        callTrue(s);
      };
    }
    soigneToken(token2, soins, evt, callTrueFinal, callMax);
  }

  function aoeSoin(msg) {
    var args = msg.content.split(' ');
    if (args.length < 2) {
      error("Pas assez d'arguments pour !cof-aoe-soin: " + msg.content, args);
      return;
    }
    var evt = {
      type: 'soins'
    };
    var titre = "Soins de groupe";
    var soigneur;
    var soins;
    if (args[1] == "groupe") {
      if (msg.selected === undefined || msg.selected.length === 0) {
        error("Il faut sélectionner un token qui lance le sort de soins de groupe", msg);
        return;
      }
      if (msg.selected.length > 1) {
        error("Plusieurs tokens sélectionnés comme lançant le sort de soins de groupe.", msg.selected);
      }
      var tokSoigneur = getObj('graphic', msg.selected[0]._id);
      var charIdSoigneur = tokSoigneur.get('represents');
      if (charIdSoigneur === '') {
        error("Le token sélectionné ne représente aucun personnage", tokSoigneur);
        return;
      }
      var niveau = attributeAsInt(charIdSoigneur, 'NIVEAU', 1);
      if (state.COFantasy.combat) {
        var dejaSoigne = attributeAsBool(charIdSoigneur, 'soinsDeGroupe', false);
        if (dejaSoigne) {
          sendChar(charIdSoigneur, " a déjà fait un soin de groupe durant ce combat");
          return;
        }
        setTokenAttr(tokSoigneur, charIdSoigneur, 'soinsDeGroupe', true, evt);
      }
      if (!depenseMana(tokSoigneur, charIdSoigneur, 1,
          "lancer un soin de groupe", evt)) return;
      if (msg.content.includes(' --puissant')) {
        soins = randomInteger(10) + niveau;
      } else {
        soins = randomInteger(8) + niveau;
      }
      var nameSoigneur = tokSoigneur.get('name');
      soigneur = getObj('character', charIdSoigneur);
      titre = nameSoigneur + " lance un soin de groupe";
      msg.content += " --allies --self";
    } else { // soin générique
      soins = parseInt(args[1]);
      if (isNaN(soins) || soins < 1) {
        error(
          "L'argument de !cof-aoe-soin doit être un nombre positif",
          msg.content);
        return;
      }
    }
    if (soins <= 0) {
      sendChat('', "Pas de soins (total de soins " + soins + ")");
      return;
    }
    var display = startFramedDisplay(msg.playerid, titre, soigneur);
    getSelected(msg, function(selected) {
      if (selected.length === 0) {
        addLineToFramedDisplay(display, "Aucune cible sélectionnée pour le soin");
        sendChat("", endFramedDisplay(display));
        addEvent(evt);
        return;
      }
      evt.affectes = [];
      iterSelected(selected, function(token, charId) {
        var name = token.get('name');
        var callMax = function() {
          addLineToFramedDisplay(display, "Pas besoin de soigner " + name + ". " +
            onGenre(charId, "Il", "Elle") +
            " est déjà au maximum de PV");
          return;
        };
        var callTrue = function(soinsEffectifs) {
          addLineToFramedDisplay(display, name + " est soigné" + eForFemale(charId) + " de " + soinsEffectifs + " PV");
        };
        soigneToken(token, soins, evt, callTrue, callMax);
      });
      sendChat("", endFramedDisplay(display));
      addEvent(evt);
    });
  }

  function natureNourriciere(msg) {
    var args = msg.content.split(" ");
    if (args.length < 2) {
      error("Pas assez d'arguments pour !cof-nature-nourriciere: " + msg.content, args);
      return;
    }
    var token = getObj("graphic", args[1]);
    if (token === undefined) {
      error("Le premier argument n'est pas un token: " + msg.content, args[1]);
      return;
    }
    var charId = token.get('represents');
    if (charId === "") {
      error("Le token sélectionné ne correspond pas à un personnage", args);
      return;
    }
    var duree = randomInteger(6);
    var output =
      "cherche des herbes. Après " + duree + " heures, " +
      onGenre(charId, "il", "elle");
    testCaracteristique(charId, 'SAG', [], 10, token,
      function(reussite, rollText) {
        if (reussite) {
          output += " revient avec de quoi soigner les blessés.";
        } else {
          output += " revient bredouille.";
        }
        sendChar(charId, output);
      });
  }

  function ignorerLaDouleur(msg) {
    var cmd = msg.content.split(' ');
    if (msg.length < 2) {
      error("Il faut en premier argument l'id d'un token pour !cof-ignorer-la-douleur", cmd);
      return;
    }
    var tokenId = cmd[1];
    var token = getObj('graphic', tokenId);
    if (token === undefined) {
      error("Il faut en premier argument l'id d'un token pour !cof-ignorer-la-douleur", cmd);
      return;
    }
    var charId = token.get('represents');
    if (charId === undefined || charId === '') {
      error("Il faut en premier argument l'id d'un token qui représente un personnage pour !cof-ignorer-la-douleur", token);
      return;
    }
    if (attributeAsInt(charId, 'ignorerLaDouleur', 0, token) > 0) {
      sendChar(charId, "a déjà ignoré la doubleur une fois pendant ce combat");
      return;
    }
    var lastAct = lastEvent();
    if (lastAct === undefined || lastAct.type != 'attaque') {
      sendChar(charId, "s'y prend trop tard pour ignorer la douleur : la dernière action n'était pas une attaque");
      return;
    }
    if (lastAct.affectes === undefined) {
      sendChar(charId, "ne peut ignorer la douleur : il semble que la dernière attaque n'ait affecté personne");
      return;
    }
    var affecte = lastAct.affectes.find(function(aff) {
      return (aff.affecte.id == tokenId);
    });
    if (affecte === undefined || affecte.prev === undefined) {
      sendChar(charId, "ne peut ignorer la douleur : il semble que la dernière attaque ne l'ait pas affecté");
      return;
    }
    var lastBar1 = affecte.prev.bar1_value;
    var bar1 = parseInt(token.get('bar1_value'));
    if (isNaN(lastBar1) || isNaN(bar1) || lastBar1 <= bar1) {
      sendChar(charId, "ne peut ignorer la douleur : il semble que la dernière attaque ne lui ai pas enlevé de PV");
      return;
    }
    var evt = {
      type: 'ignorer_la_douleur',
      affectes: [{
        affecte: token,
        prev: {
          bar1_value: bar1
        }
      }]
    };
    updateCurrentBar(token, 1, lastBar1);
    setTokenAttr(token, charId, 'ignorerLaDouleur', lastBar1 - bar1, evt);
    sendChar(charId, " ignore la douleur de la dernière attaque");
  }

  function fortifiant(msg) {
    var cmd = msg.content.split(' ');
    if (cmd.length < 3) {
      error("La fonction !cof-fortifiant attend en argument celui qui a produit le fortifiant et celui qui en bénéficie", cmd);
      return;
    }
    var tok1Id = cmd[1];
    var token1 = getObj('graphic', tok1Id);
    if (token1 === undefined) {
      error("Le premier argument de !cof-fortifiant doit être un token", tok1Id);
      return;
    }
    var char1Id = token1.get('represents');
    if (char1Id === '') {
      error("Le token ne représente pas de personnage", token1);
      return;
    }
    var tok2Id = cmd[2];
    var token2 = getObj('graphic', tok2Id);
    if (token2 === undefined) {
      error("Le second argument de !cof-fortifiant doit être un token", tok1Id);
      return;
    }
    var char2Id = token2.get('represents');
    if (char2Id === '') {
      error("Le token ne représente pas de personnage", token2);
      return;
    }
    var rang = attributeAsInt(char1Id, 'voieDesElixirs', 0);
    if (rang < 1) {
      sendChar(char1Id, "ne sait pas préparer des élixirs ?");
      return;
    }
    var nbFortifiants = attributeAsInt(char1Id, 'fortifiants', 0, token1);
    if (nbFortifiants < 1) {
      sendChar(char1Id, "n'a pas de fortifiant sur lui");
      return;
    }
    var evt = {
      type: 'fortifiant',
      attributes: []
    };
    // On enlève un fortifiant
    setTokenAttr(token1, char1Id, 'fortifiants', nbFortifiants - 1, evt);
    // Puis on soigne la cible
    var name2 = token2.get('name');
    var soins = randomInteger(4) + rang;
    soigneToken(token2, soins, evt, function(soinsEffectifs) {
      sendChar(char1Id, "donne à " + name2 + " un fortifiant");
      sendChar(char2Id, "est soigné de " + soinsEffectifs + " PV");
    });
    // Finalement on met l'effet fortifie
    setTokenAttr(token2, char2Id, 'fortifie', rang + 1, evt);
    addEvent(evt);
  }

  function lancerSort(msg) {
    var cmd = msg.content.split(' ');
    if (cmd.length < 4) {
      error("La fonction !cof-lancer-sort attend en argument celui qui lance le sort et le coût en mana", cmd);
      return;
    }
    var tokenId = cmd[1];
    var token = getObj('graphic', tokenId);
    if (token === undefined) {
      error("Le premier argument de !cof-lancer-sort doit être un token", tokenId);
      return;
    }
    var charId = token.get('represents');
    if (charId === '') {
      error("Le token ne représente pas de personnage", token);
      return;
    }
    var mana = parseInt(cmd[2]);
    if (isNaN(mana) || mana < 0) {
      error("Le deuxième argument de !cof-lancer-sort doit être un nombre positif", cmd[2]);
      return;
    }
    var msgPos = msg.content.indexOf(' '); // just before the token id
    msgPos = msg.content.indexOf(' ', msgPos + 1); // just before mana cost
    var spell = msg.content.substring(msg.content.indexOf(' ', msgPos + 1) + 1);
    var evt = {
      type: "lancement de sort"
    };
    if (depenseMana(token, charId, mana, spell, evt)) {
      sendChar(charId, "/w " + token.get('name') + " " + spell);
      sendChar(charId, "/w GM " + spell);
      addEvent(evt);
    }
  }

  function distribuerBaies(msg) {
    if (msg.selected === undefined || msg.selected.length != 1) {
      error("Pour utiliser !cof-distribuer-baies, il faut sélectionner un token", msg);
      return;
    }
    var tokenDruide = getObj('graphic', msg.selected[0]._id);
    if (tokenDruide === undefined) {
      error("Erreur de sélection dans !cof-distribuer-baies", msg.selected);
      return;
    }
    var charIdDruide = tokenDruide.get('represents');
    if (charIdDruide === '') {
      error("Le token sélectionné pour !cof-distribuer-baies doit représenter un personnage", tokenDruide);
      return;
    }
    var niveau = attributeAsInt(charIdDruide, 'NIVEAU', 1);
    var evt = {
      type: "Distribution de baies magiques"
    };
    var titre =
      "<b>" + tokenDruide.get('name') + "</b> distribue des baies";
    var display = startFramedDisplay(msg.playerid, titre, getObj('character', charIdDruide));
    getSelected(msg, function(selected) {
      var tokensToProcess = selected.length;
      var sendEvent = function() {
        if (tokensToProcess == 1) {
          addEvent(evt);
          sendChat("", endFramedDisplay(display));
        }
        tokensToProcess--;
      };
      iterSelected(selected, function(token, charId) {
        var baie = attributeAsInt(charId, 'baieMagique', 0, token);
        if (baie >= niveau || baie < 0) return; //baie plus puissante ou déjà mangée
        setTokenAttr(token, charId, 'baieMagique', niveau, evt);
        var line = token.get('name') + " reçoit une baie";
        if (token.id == tokenDruide.id) line = token.get('name') + " en garde une pour lui";
        addLineToFramedDisplay(display, line);
        sendEvent();
      });
    });
  }

  function consommerBaie(msg) {
    if (msg.selected === undefined) {
      error("Il fait sélectionner un token pour !cof-consommer-baie", msg);
      return;
    }
    var evt = {
      type: "consommer une baie"
    };
    iterSelected(msg.selected, function(token, charId) {
      var baie = attributeAsInt(charId, 'baieMagique', 0, token);
      if (baie === 0) {
        sendChar(charId, "n'a pas de baie à manger");
        return;
      }
      if (baie < 0) {
        sendChar(charId, "a déjà mangé une baie aujourd'hui. Pas d'effet");
        return;
      }
      var soins = randomInteger(6) + baie;
      setTokenAttr(token, charId, 'baieMagique', -1, evt);
      soigneToken(token, soins, evt, function(soinsEffectifs) {
        sendChar(charId, "mange une baie magique. Il est rassasié et récupère " + soinsEffectifs + " points de vie");
      });
    });
    addEvent(evt);
  }

  function replaceInline(msg) {
    if (_.has(msg, 'inlinerolls')) {
      msg.content = _.chain(msg.inlinerolls)
        .reduce(function(m, v, k) {
          m['$[[' + k + ']]'] = v.results.total || 0;
          return m;
        }, {})
        .reduce(function(m, v, k) {
          return m.replace(k, v);
        }, msg.content)
        .value();
    }
  }

  /* Quand on protège un allié, on stocke l'id et le nom du token dans un attribut 'protegerUnAllie' (champs current et max), et pour ce token, on met un 
   * attribut 'protegePar_nom' où nom est le nom du token protecteur, et qui contient l'id et le nom du token protecteur
   * Ces attributs disparaissent à la fin des combats */
  function protegerUnAllie(msg) {
    var args = msg.content.split(" ");
    if (args.length < 3) {
      error("Pas assez d'arguments pour !cof-proteger-un-allie: " + msg.content, args);
      return;
    }
    var tokenProtecteur = getObj("graphic", args[1]);
    if (tokenProtecteur === undefined) {
      error("Le premier argument n'est pas un token: " + msg.content, args[1]);
      return;
    }
    var charIdProtecteur = tokenProtecteur.get('represents');
    if (charIdProtecteur === "") {
      error("Le token sélectionné ne correspond pas à un personnage", args);
      return;
    }
    var nameProtecteur = tokenProtecteur.get('name');
    var pageId = tokenProtecteur.get('pageid');
    var target = tokenOfId(args[2], args[2], pageId);
    if (target === undefined) {
      error("Le deuxième argument n'est pas un token valide: " + msg.content, args[2]);
      return;
    }
    var tokenTarget = target.token;
    if (tokenTarget.id == tokenProtecteur.id) {
      sendChar(charIdProtecteur, "ne peut pas se protéger lui-même");
      return;
    }
    var charIdTarget = target.charId;
    var nameTarget = tokenTarget.get('name');
    var evt = {
      type: "Protéger un allié"
    };
    var attrsProtecteur =
      tokenAttribute(charIdProtecteur, 'protegerUnAllie', tokenProtecteur);
    var protegePar = 'protegePar_' + nameProtecteur;
    if (attrsProtecteur.length > 0) { //On protège déjà quelqu'un
      var previousTarget =
        tokenOfId(attrsProtecteur[0].get('current'),
          attrsProtecteur[0].get('max'), pageId);
      if (previousTarget) {
        if (previousTarget.token.id == tokenTarget.id) {
          sendChar(charIdProtecteur, "protège déjà " + nameTarget);
          return;
        }
        removeTokenAttr(previousTarget.token, previousTarget.charId,
          protegePar, evt, "n'est plus protégé par " + nameProtecteur);
      }
    }
    setTokenAttr(tokenProtecteur, charIdProtecteur, 'protegerUnAllie',
      tokenTarget.id, evt, "protège " + nameTarget, nameTarget);
    setTokenAttr(tokenTarget, charIdTarget, protegePar,
      tokenProtecteur.id, evt, undefined, nameProtecteur);
    addEvent(evt);
  }

  function apiCommand(msg) {
    msg.content = msg.content.replace(/\s+/g, ' '); //remove duplicate whites
    var command = msg.content.split(" ", 1);
    // First replace inline rolls by their values
    if (command[0] != "!cof-aoe") replaceInline(msg);
    var evt;
    switch (command[0]) {
      case "!cof-attack":
        parseAttack(msg);
        return;
      case "!cof-undo":
        undoEvent();
        return;
      case "!cof-hors-combat":
        sortirDuCombat();
        return;
      case "!cof-nuit":
        nuit(msg);
        return;
      case "!cof-jour":
        evt = {
          type: "Nouveau jour"
        };
        jour(evt);
        addEvent(evt);
        return;
      case "!cof-recuperation":
        recuperer(msg);
        return;
      case "!cof-recharger":
        recharger(msg);
        return;
      case "!cof-chance":
        chance(msg);
        return;
      case "!cof-surprise":
        surprise(msg);
        return;
      case "!cof-init":
        if (!_.has(msg, 'selected')) {
          error("Dans !cof-init : rien à faire, pas de token selectionné", msg);
          return;
        }
        evt = {
          type: "initiative"
        };
        initiative(msg.selected, evt);
        addEvent(evt);
        return;
      case "!cof-attendre":
        attendreInit(msg);
        return;
      case "!cof-statut":
        statut(msg);
        return;
      case "!cof-armure-magique":
        armureMagique(msg);
        return;
      case "!cof-buf-def":
        bufDef(msg);
        return;
      case "!cof-remove-buf-def":
        removeBufDef(msg);
        return;
      case "!cof-aoe":
        aoe(msg);
        return;
      case "!cof-set-state":
        interfaceSetState(msg);
        return;
      case "!cof-degainer":
        degainer(msg);
        return;
      case "!cof-echange-init":
        echangeInit(msg);
        return;
      case "!cof-a-couvert":
        aCouvert(msg);
        return;
      case "!cof-effet-temp":
        effetTemporaire(msg);
        return;
      case "!cof-attaque-magique":
        attaqueMagique(msg);
        return;
      case "!cof-sommeil":
        sommeil(msg);
        return;
      case "!cof-transe-guerison":
        transeGuerison(msg);
        return;
      case "!cof-soin":
        soin(msg);
        return;
      case "!cof-aoe-soin":
        aoeSoin(msg);
        return;
      case "!cof-nature-nourriciere":
        natureNourriciere(msg);
        return;
      case "!cof-ignorer-la-douleur":
        ignorerLaDouleur(msg);
        return;
      case "!cof-fortifiant":
        fortifiant(msg);
        return;
      case "!cof-intercepter":
        intercepter(msg);
        return;
      case "!cof-exemplaire":
        exemplaire(msg);
        return;
      case "!cof-lancer-sort":
        lancerSort(msg);
        return;
      case "!cof-peur":
        peur(msg);
        return;
      case "!cof-distribuer-baies":
        distribuerBaies(msg);
        return;
      case "!cof-consommer-baie":
        consommerBaie(msg);
        return;
      case "!cof-proteger-un-allie":
        protegerUnAllie(msg);
        return;
      default:
        return;
    }
  }

  var messageEffets = {
    sous_tension: {
      activation: "se charge d'énergie électrique",
      actif: "est chargé d'énergie électrique",
      fin: "n'est plus chargé d'énergie électrique"
    },
    a_couvert: {
      activation: "reste à couvert",
      actif: "est à couvert",
      fin: "n'est plas à couvert"
    },
    image_decalee: {
      activation: "décale légèrement son image",
      actif: "a décalé son image",
      fin: "apparaît à nouveau là où il se trouve"
    },
    chant_des_heros: {
      activation: "écoute le chant du barde",
      actif: "est inspiré par le Chant des Héros",
      fin: "n'est plus inspiré par le Chant des Héros"
    },
    benediction: {
      activation: "est touché par la bénédiction",
      actif: "est béni",
      fin: "l'effet de la bénédiction s'estompe"
    },
    cri_de_guerre: {
      activation: "pousse son cri de guerre",
      actif: "a effrayé ses adversaires",
      fin: "n'effraie plus ses adversaires"
    },
    peau_d_ecorce: {
      activation: "donne à sa peau la consistance de l'écorce",
      actif: "a la peau dure comme l'écorce",
      fin: "retrouve une peau normale"
    },
    rayon_affaiblissant: {
      activation: "est touché par un rayon affaiblissant",
      actif: "est sous l'effet d'un rayon affaiblissant",
      fin: "n'est plus affaibli"
    },
    peur: {
      activation: "prend peur",
      actif: "est dominé par sa peur",
      fin: "retrouve du courage"
    },
    peurEtourdi: {
      activation: "prend peur: il peut fuir ou rester recroquevillé",
      actif: "est paralysé par la peur",
      fin: "retrouve du courage et peut à nouveau agir"
    },
    epeeDansante: {
      activation: "fait apparaître une lame d'énergie lumineuse",
      actif: "contrôle une lame d'énergie lumineuse",
      fin: "La lame d'énergie lumineuse disparaît"
    },
    putrefaction: {
      activation: "vient de contracter une sorte de lèpre fulgurante",
      actif: "est en pleine putréfaction",
      fin: "La putréfaction s'arrête."
    },
    forgeron: {
      activation: "enflamme son arme",
      actif: "a une arme en feu",
      fin: "L'arme n'est plus enflammée."
    },
    agrandissement: {
      activation: "se met à grandir",
      actif: "est vraiment très grand",
      fin: "retrouve sa taille normale"
    },
    formeGazeuse: {
      activation: "semble perdre de la consistance",
      actif: "est en forme gazeuse",
      fin: "retrouve sa consistance normale"
    },
  };

  var patternEffetsTemp =
    new RegExp(_.reduce(messageEffets, function(reg, msg, effet) {
      var res = reg;
      if (res !== "(") res += "|";
      res += "^" + effet + "($|_)";
      return res;
    }, "(") + ")");

  function estEffetTemp(name) {
    return (patternEffetsTemp.test(name));
  }

  function effetOfAttribute(attr) {
    var ef = attr.get('name');
    if (ef === undefined || _.has(messageEffets, ef)) return ef;
    for (var effet in messageEffets) {
      if (ef.startsWith(effet + "_")) return effet;
    }
    error("Impossible de déterminer l'effet correspondant à " + ef, attr);
    return undefined;
  }

  // Fait foo sur tous les tokens représentant charId, ayant l'effet donné, et correspondant au nom d'attribut. Pour le cas où le token doit être lié au personnage, on ne prend qu'un seul token, sauf si filterUnique est défini, auquel cas on  fait l'appel sur tous les tokens qui passes filterUnique
  function iterTokensOfEffet(charId, effet, attrName, foo, filterUnique) {
    if (attrName == effet) { //token lié au character
      var tokens =
        findObjs({
          _type: 'graphic',
          _subtype: 'token',
          represents: charId
        });
      tokens = tokens.filter(function(tok) {
        return (tok.get('bar1_link') !== '');
      });
      if (tokens.length === 0) {
        log("Pas de token pour un personnage");
        log(charId);
        log(attrName);
        return;
      }
      if (filterUnique) {
        tokens.forEach(function(tok) {
          if (filterUnique(tok)) foo(tok);
        });
      } else foo(tokens[0]);
    } else { //token non lié au character
      var tokenName = attrName.substring(attrName.indexOf('_') + 1);
      var tNames =
        findObjs({
          _type: 'graphic',
          _subtype: 'token',
          represents: charId,
          name: tokenName,
          bar1_link: ''
        });
      tNames.forEach(function(tok) {
        foo(tok);
      });
    }
  }

  function nextTurn(cmp) {
    if (!cmp.get('initiativepage')) return;
    var turnOrder = cmp.get('turnorder');
    if (turnOrder === "") return; // nothing in the turn order
    turnOrder = JSON.parse(turnOrder);
    if (turnOrder.length < 1) return;
    var evt = {
      type: 'personnage suivant',
      attributes: [],
      deletedAttributes: []
    };
    var active = turnOrder[0];
    // Si on a changé d'initiative, alors diminue les effets temporaires
    var init = parseInt(active.pr);
    if (active.id == "-1" && active.custom == "Tour") init = 0;
    if (state.COFantasy.init > init) {
      var attrs = findObjs({
        _type: 'attribute'
      });
      attrs = attrs.filter(function(obj) {
        if (!estEffetTemp(obj.get('name'))) return false;
        var obji = obj.get('max');
        return (init < obji && obji <= state.COFantasy.init);
      });
      attrs.forEach(function(attr) {
        var charId = attr.get('characterid');
        var effet = effetOfAttribute(attr);
        var attrName = attr.get('name');
        var v = attr.get('current');
        if (v > 0) {
          attr.set('current', v - 1);
          evt.attributes.push({
            attribute: attr,
            current: v
          });
          if (effet == 'putrefaction') { //prend 1d6 DM
            iterTokensOfEffet(charId, effet, attrName, function(token) {
              var putref = randomInteger(6);
              var dmg = {
                type: 'maladie',
                total: putref,
                display: putref
              };
              putref = dealDamage(token, charId, dmg, evt, 1, {
                magique: 'true'
              });
              onGenre(charId, 'Il', 'Elle');
              sendChar(charId, " pourrit. " + onGenre(charId, 'Il', 'Elle') +
                " subit " + putref + " DM");
            });
          }
        } else {
          if (effet !== undefined)
            sendChar(charId, messageEffets[effet].fin);
          if (effet == 'agrandissement') { //redonner sa taille normale
            evt.affectes = evt.affectes || [];
            getObj('character', charId).get('defaulttoken', function(normalToken) {
              normalToken = JSON.parse(normalToken);
              var largeWidth = normalToken.width + normalToken.width / 2;
              var largeHeight = normalToken.height + normalToken.height / 2;
              iterTokensOfEffet(charId, effet, attrName, function(token) {
                  var width = token.get('width');
                  var height = token.get('height');
                  evt.affectes.push({
                    affecte: token,
                    prev: {
                      width: width,
                      height: height
                    }
                  });
                  token.set('width', normalToken.width);
                  token.set('height', normalToken.height);
                },
                function(token) {
                  if (token.get('width') == largeWidth) return true;
                  if (token.get('height') == largeHeight) return true;
                  return false;
                }
              );
            });
          } else if (attrName == 'peur' || attrName == 'peurEtourdi') { //trouver les tokens
            var tokens =
              findObjs({
                _type: 'graphic',
                _subtype: 'token',
                represents: charId
              });
            tokens.forEach(function(tok) {
              if (tok.get('bar1_link') === '' || !tok.get(cof_states.apeure)) return;
              setState(tok, 'apeure', false, evt, charId);
            });
          } else if (attrName.startsWith('peur_') ||
            attrName.startsWith('peurEtourdi_')) {
            var tokenName = attrName.substring(attrName.indexOf('_') + 1);
            var tNames =
              findObjs({
                _type: 'graphic',
                _subtype: 'token',
                represents: charId,
                name: tokenName,
                bar1_link: ''
              });
            tNames.forEach(function(tok) {
              setState(tok, 'apeure', false, evt, charId);
            });
          }
          evt.deletedAttributes.push(attr);
          attr.remove();
        }
      });
      state.COFantasy.init = init;
    }
    if (active.id == "-1" && active.custom == "Tour") {
      var tour = parseInt(active.pr);
      if (isNaN(tour)) {
        error("Tour invalide", active);
        return;
      }
      evt.tour = tour - 1;
      evt.updateNextInitSet = updateNextInitSet;
      active.pr = tour - 1; // préparation au calcul de l'undo
      sendChat("GM", "Début du tour " + tour);
      state.COFantasy.tour = tour;
      state.COFantasy.init = 1000;
      // Enlever les bonus d'un tour
      removeAllAttributes('actionConcertee', evt);
      removeAllAttributes('intercepter', evt);
      removeAllAttributes('exemplaire', evt);
      // nouveau tour : enlever le statut surpris
      // et faire les actions de début de tour
      var selected = [];
      updateNextInitSet.forEach(function(id) {
        selected.push({
          _id: id
        });
      });
      findObjs({
        _type: 'graphic',
        _subtype: 'token'
      }).forEach(function(tok) {
        var charId = tok.get('represents');
        if (charId === '') return;
        if (getState(tok, 'surpris', charId)) { //surprise
          setState(tok, 'surpris', false, {}, charId);
          selected.push({
            _id: tok.id
          });
        }
        var enflammeAttr = tokenAttribute(charId, 'enflamme', tok);
        if (enflammeAttr.length > 0) {
          var enflamme = parseInt(enflammeAttr[0].get('current'));
          // Pour ne pas faire les dégâts plusieurs fois (plusieurs tokens pour un même personnage), on utilise la valeur max de l'attribu
          var dernierTourEnflamme = parseInt(enflammeAttr[0].get('max'));
          if ((isNaN(dernierTourEnflamme) || dernierTourEnflamme < tour) &&
            !isNaN(enflamme) && enflamme > 0) {
            var d6Enflamme = randomInteger(6);
            var feu = d6Enflamme + enflamme - 1;
            var dmg = {
              type: 'feu',
              total: feu,
              display: feu
            };
            feu = dealDamage(tok, charId, dmg, evt, 1);
            sendChar(charId, " est en flamme ! " +
              onGenre(charId, 'Il', 'Elle') + " subit " + feu + " DM");
            if (d6Enflamme < 3) {
              sendChar(charId, " les flammes s'éteignent");
              removeTokenAttr(tok, charId, 'enflamme', evt);
            } else {
              enflammeAttr[0].set('max', tour);
            }
          }
        }
      });
      initiative(selected, evt); // met Tour à la fin et retrie
      updateNextInitSet = new Set();
    } else { // change the active token
      setActiveToken(active.id, evt);
    }
    var lastHead = turnOrder.pop();
    turnOrder.unshift(lastHead);
    evt.turnorder = JSON.stringify(turnOrder);
    addEvent(evt);
  }

  function destroyToken(token) { //to remove unused local attributes
    var charId = token.get('represeernts');
    if (charId === "") return;
    if (token.get('bar1_link') !== "") return;
    var endName = "_" + token.get('name');
    var tokAttr = findObjs({
      _type: 'attribute',
      _characterid: charId
    });
    tokAttr = tokAttr.filter(function(obj) {
      return obj.get('name').endsWith(endName);
    });
    if (tokAttr.length > 0) {
      log("Removing token local attributes");
      log(tokAttr);
      tokAttr.forEach(function(attr) {
        attr.remove();
      });
    }
  }

  return {
    apiCommand: apiCommand,
    nextTurn: nextTurn,
    destroyToken: destroyToken
  };

}();

on("ready", function() {
  COF_loaded = true;
  state.COFantasy = state.COFantasy || {
    combat: false,
    tour: 0,
    init: 1000
  };
  log("COFantasy loaded");
});

on("chat:message", function(msg) {
  "use strict";
  if (!COF_loaded || msg.type != "api") return;
  COFantasy.apiCommand(msg);
});

on("change:campaign:turnorder", COFantasy.nextTurn);

on("destroy:token", COFantasy.destroyToken);
