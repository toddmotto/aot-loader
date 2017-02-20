import {
  CallExpression,
  Decorator,
  Identifier,
  ImportDeclaration,
  ModuleName,
  NamespaceImport,
  Node,
  NodeArray,
  ObjectLiteralElementLike,
  ObjectLiteralExpression,
  PropertyAssignment,
  PropertyDeclaration,
  QualifiedName,
  SourceFile,
  StringLiteral,
  SyntaxKind,
  TypeNode,
  TypeReferenceNode
} from 'typescript';

export { NodeArray };

export function findNodes<T extends Node>(
  node: Node,
  kind: SyntaxKind,
  sourceFile: SourceFile = node as SourceFile,
  recursive: boolean = false
): T[] {
  let nodes: T[] = [];
  if (node.kind === kind) {
    if (!recursive) {
      return [node as T];
    }
    nodes.push(node as T);
  }
  for (let child of node.getChildren(sourceFile)) {
    const childNodes = findNodes<T>(child, kind, sourceFile, recursive);

    for (let i = 0; i < childNodes.length; i++) {
      nodes.push(childNodes[i]);
    }
  }
  return nodes;
}

export function filterDuplicates<T>(arr: T[]) {
  return [...Array.from(new Set<T>(arr))];
}

export function flatten<T>(arr: any[]): T[] {
  return arr.reduce((a, b) => a.concat(Array.isArray(b) ? flatten<T>(b) : b), []);
}

export function getDecorator(node: Decorator) {
  return ((node.expression as CallExpression).expression as StringLiteral).text;
}

export function getLeft(name: QualifiedName) {
  return (name.left as Identifier).text;
}

export function getInitializer(node: PropertyAssignment) {
  return (node.initializer as StringLiteral).text;
}

export function getModule(dec: ImportDeclaration) {
  return (dec.moduleSpecifier as StringLiteral).text;
}

export function getNamespace(dec: ImportDeclaration) {
  return (dec.importClause.namedBindings as NamespaceImport).name.text;
}

export function getPropertyAssignments(sourceFile: SourceFile) {
  const properties = findNodes<ObjectLiteralExpression>(sourceFile, SyntaxKind.ObjectLiteralExpression, sourceFile, true)
    .map((node) => findNodes<PropertyAssignment>(node, SyntaxKind.PropertyAssignment, sourceFile));

  return flatten<PropertyAssignment>(properties);
}

export function getRight(name: QualifiedName) {
  return name.right.text;
}

export function getTypeName(type: TypeNode) {
  return (type as TypeReferenceNode).typeName;
}

export function getQualifiedType(type: TypeNode) {
  return getTypeName(type) as QualifiedName;
}

export function getTypeArguments(property: PropertyDeclaration) {
  return (property.type as TypeReferenceNode).typeArguments;
}

export function getTypeText(property: PropertyDeclaration) {
  return (getTypeName(property.type) as Identifier).text;
}

export function normalizePath({text}: StringLiteral) {
  return (text[0] !== '.' ? `./${text}` : text).replace(/\/\//g, '/');
}

export function removeUnnamedImports({importClause: c}: ImportDeclaration) {
  return !(c && !c.name && c.namedBindings) && c.namedBindings.kind === SyntaxKind.NamedImports;
}

export function byModule(name: string) {
  return (dec: ImportDeclaration) => getModule(dec) === name;
}

export function byPropertyName(name: string) {
  return (node: ObjectLiteralElementLike) => (node.name as ModuleName).text === name;
}

export function byNamespace(name: string) {
  return (dec: ImportDeclaration) => getNamespace(dec) === name;
}

export function byRightTypeArgument(name: string) {
  return (type: TypeNode) => getRight(getQualifiedType(type)) === name;
}

export function byTypeName(name: string) {
  return (property: PropertyDeclaration) => getTypeText(property) === name;
}

export function objToMap<T>(obj: {[key: string]: T}) {
  return Object.keys(obj).reduce((a, b) => a.set(b, obj[b]), new Map<string, T>());
}
