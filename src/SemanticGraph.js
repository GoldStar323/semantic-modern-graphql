const path = require('path');
const { readFileSync } = require('fs');
const createRdfParser = require('n3').Parser;
const { rdfIri, rdfsIri, owlIri, rdfsDomain } = require('./constants');
const invariant = require('./utils/invariant');
const isValidIri = require('./utils/isValidIri');
const getIriLocalName = require('./utils/getIriLocalName');
const createResolvers = require('./createResolvers');
const validateResolvers = require('./validateResolvers');
const requireGraphqlRelay = require('./requireGraphqlRelay');
const getGraphqlObjectType = require('./graphql/getGraphqlObjectType');
const getGraphqlInterfaceType = require('./graphql/getGraphqlInterfaceType');
const getRelayEdgeType = require('./graphql/getRelayEdgeType');
const getRelayConnectionType = require('./graphql/getRelayConnectionType');

const utf8 = 'utf-8';
const ttlParser = createRdfParser();
const parseFileAndIndex = (g, l) => ttlParser.parse(readFileSync(path.join(__dirname, l), utf8)).forEach(t => indexTriple(g, t));

const baseGraph = {};
const basePrefixes = {
  Rdf: rdfIri,
  Rdfs: rdfsIri,
  Owl: owlIri,
};

parseFileAndIndex(baseGraph, '../ontologies/rdf.ttl');
parseFileAndIndex(baseGraph, '../ontologies/rdfs.ttl');
parseFileAndIndex(baseGraph, '../ontologies/owl.ttl');

class SemanticGraph {

  constructor(resolvers, config = {}) {
    invariant(resolvers && typeof resolvers === 'object', 'Expected first arg to be an object');
    invariant(config && typeof config === 'object', 'Expected second arg to be an object');

    Object.assign(this, baseGraph, { config });

    this.resolvers = createResolvers(this, validateResolvers(resolvers));

    this.config.prefixes = Object.assign({}, basePrefixes, this.config.prefixes);

    if (config.relay) {
      const { fromGlobalId, nodeDefinitions } = requireGraphqlRelay();

      const resolveNode = (globalId, context, info) => this.resolvers.resolveResource(fromGlobalId(globalId).id, context, info);
      const resolveType = node => getGraphqlObjectType(this, this.resolvers.resolveSourceClassIri(node));

      // Add this.nodeInterface and this.nodeField
      Object.assign(this, nodeDefinitions(resolveNode, resolveType));
    }

    this.addTriple = t => indexTriple(this, t);
    this.parse = (d, o) => createRdfParser(o).parse(d).forEach(this.addTriple);
    this.parseFile = (l, o, e = utf8) => this.parse(readFileSync(l, e), o);
    this.getLocalName = iri => this[iri].localName ? this[iri].localName : this[iri].localName = getIriLocalName(iri);
    this.getObjectType = iri => getGraphqlObjectType(this, iri);
    this.getInterfaceType = iri => getGraphqlInterfaceType(this, iri);
    this.getEdgeType = iri => getRelayEdgeType(this, iri);
    this.getConnectionType = iri => getRelayConnectionType(this, iri);
    this.toString = () => '[SemanticGraph]';
  }

  addFieldOnObjectType(classIri, fieldName, graphqlFieldConfig) {
    if (!this[classIri]) throw new Error(`Class not found: ${classIri}`);

    const iri = `http://CUSTOM_FIELD_${Math.random().slice(2)}#${fieldName}`;

    this[iri] = { graphqlFieldConfig };
    upsert(this, iri, rdfsDomain, classIri);

    return iri; // If the user wants to extend it later (why not)
  }

  extendFieldOnObjectType(classIri, propertyIri, graphqlFieldConfigExtension) {
    const x = this[classIri];

    if (!x) throw new Error(`Class not found: ${classIri}`);

    if (!x.graphqlFieldConfigExtensionMap) x.graphqlFieldConfigExtensionMap = {};

    x.graphqlFieldConfigExtensionMap[propertyIri] = graphqlFieldConfigExtension;
  }

}

function indexTriple(g, { subject, predicate, object }) {
  if (!(isValidIri(subject) && isValidIri(predicate)) || g[subject] && g[subject][predicate] && g[subject][predicate].includes(object)) return;

  upsert(g, subject, predicate, object);

  if (isValidIri(object)) upsert(g, object, `_${predicate}`, subject);
}

function upsert(theGuy, whoDid, what, kevinOffACliff) {
  const theGuyWhoDid = theGuy[whoDid];

  /*do you know*/theGuyWhoDid ?
  theGuyWhoDid[what] ?
  theGuyWhoDid[what].push(kevinOffACliff) :
  theGuyWhoDid[what] = [kevinOffACliff] : // ?!!??!
  theGuy[whoDid] = { [what]: [kevinOffACliff] };
}

module.exports = SemanticGraph;
