import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { SemanticAnalyzer } from '@/lib/compiler/semanticAnalyzer';
import { IntermediateCodeGenerator, formatTAC } from '@/lib/compiler/intermediateCodeGenerator';
import { CodeOptimizer, formatOptimizedCode } from "@/utils/codeOptimizer";
import { CodeGenerator, formatAssembly } from "@/utils/codeGenerator";
import MonacoEditor, { loader } from '@monaco-editor/react';

// Define token types
const TokenType = {
  PREPROCESSOR: 'PREPROCESSOR',
  KEYWORD: 'KEYWORD',
  IDENTIFIER: 'IDENTIFIER',
  NUMBER: 'NUMBER',
  STRING_LITERAL: 'STRING_LITERAL',
  OPERATOR: 'OPERATOR',
  SEPARATOR: 'SEPARATOR',
  OPEN_PAREN: 'OPEN_PAREN',
  CLOSE_PAREN: 'CLOSE_PAREN',
  OPEN_BRACE: 'OPEN_BRACE',
  CLOSE_BRACE: 'CLOSE_BRACE',
  COMMENT: 'COMMENT',
  UNDEFINED: 'UNDEFINED'
};

// Token regex patterns
const tokenRegex = {
  [TokenType.PREPROCESSOR]: /^#\s*\w+\s*(<[^>]+>|\"[^\"]+\")/,
  [TokenType.KEYWORD]: /\b(int|char|float|double|if|else|for|while|return|void|include|define)\b/,
  [TokenType.IDENTIFIER]: /\b[a-zA-Z_]\w*\b/,
  [TokenType.NUMBER]: /\b(0x[0-9A-Fa-f]+|\d+(\.\d+)?([eE][-+]?\d+)?)\b/,
  [TokenType.STRING_LITERAL]: /^"([^"\\]|\\.)*"/,
  [TokenType.OPERATOR]: /^(==|!=|<=|>=|\+\+|--|->|&&|\|\||[-+*/%=<>&^|!~])/,
  [TokenType.SEPARATOR]: /^[;,.:]/,
  [TokenType.OPEN_PAREN]: /^[(]/,
  [TokenType.CLOSE_PAREN]: /^[)]/,
  [TokenType.OPEN_BRACE]: /^[{]/,  
  [TokenType.CLOSE_BRACE]: /^[}]/,
  [TokenType.COMMENT]: /^\/\/.*|^\/\*[\s\S]*?\*\//
};

// Token classification function
function classifyLexeme(lexeme: string) {
  for (const [type, regex] of Object.entries(tokenRegex)){
    if (regex.test(lexeme)) return { type, value: lexeme };
  }
  return { type: TokenType.UNDEFINED, value: lexeme };
}

// Tokenizer function
function tokenize(inputCode: string) {
  const tokens: any[] = [];
  inputCode = inputCode.replace(/\/\*[\s\S]*?\*\//g, match => {
    tokens.push({ type: TokenType.COMMENT, value: match });
    return ' '.repeat(match.length);
  });

  const lines = inputCode.split('\n');

  for (let line of lines) {
    let i = 0;
    if (/^\s*#/.test(line)) {
      const match = line.trim();
      tokens.push({ type: TokenType.PREPROCESSOR, value: match });
      continue;
    }

    while (i < line.length) {
      if (/\s/.test(line[i])) {
        i++;
        continue;
      }
      if (line[i] === '/' && line[i + 1] === '/') {
        const comment = line.slice(i);
        tokens.push({ type: TokenType.COMMENT, value: comment });
        break;
      }
      if (line[i] === '"') {
        const match = line.slice(i).match(/^"([^"\\]|\\.)*"/);
        if (match) {
          tokens.push({ type: TokenType.STRING_LITERAL, value: match[0] });
          i += match[0].length;
        } else {
          tokens.push({ type: TokenType.UNDEFINED, value: '"' });
          i++;
        }
        continue;
      }
      const twoChar = line.slice(i, i + 2);
      if (tokenRegex[TokenType.OPERATOR].test(twoChar)) {
        tokens.push({ type: TokenType.OPERATOR, value: twoChar });
        i += 2;
        continue;
      }

      const oneChar = line[i];
      if (tokenRegex[TokenType.OPERATOR].test(oneChar)) {
        tokens.push({ type: TokenType.OPERATOR, value: oneChar });
        i++;
        continue;
      }
      if (tokenRegex[TokenType.SEPARATOR].test(oneChar)) {
        tokens.push({ type: TokenType.SEPARATOR, value: oneChar });
        i++;
        continue;
      }
      if (tokenRegex[TokenType.OPEN_PAREN].test(oneChar)) {
        tokens.push({ type: TokenType.OPEN_PAREN, value: oneChar });
        i++;
        continue;
      }
      if (tokenRegex[TokenType.CLOSE_PAREN].test(oneChar)) {
        tokens.push({ type: TokenType.CLOSE_PAREN, value: oneChar });
        i++;
        continue;
      }
      if (tokenRegex[TokenType.OPEN_BRACE].test(oneChar)) {
        tokens.push({ type: TokenType.OPEN_BRACE, value: oneChar });
        i++;
        continue;
      }
      if (tokenRegex[TokenType.CLOSE_BRACE].test(oneChar)) {
        tokens.push({ type: TokenType.CLOSE_BRACE, value: oneChar });
        i++;
        continue;
      }
      let lexeme = '';
      while (i < line.length && /[a-zA-Z0-9_]/.test(line[i])) {
        lexeme += line[i++];
      }

      if (lexeme.length > 0) {
        tokens.push(classifyLexeme(lexeme));
      } else {
        tokens.push({ type: TokenType.UNDEFINED, value: oneChar });
        i++;
      }
    }
  }

  return tokens;
}

// Parser variables and functions
let current = 0;

function isTypeSpecifier(token: any) {
  const types = ['int', 'char', 'float', 'double', 'void'];
  return token.type === 'KEYWORD' && types.includes(token.value);
}

function parse(tokens: any[]) {
  return parseProgram(tokens);
}

function parseProgram(tokens: any[]) {
  let body: any[] = [];
  current = 0;

  while (current < tokens.length) {
    let token = tokens[current];

    if (token.type === 'COMMENT') {
      current++;
      continue;
    }

    if (token.type === 'PREPROCESSOR') {
      body.push({ type: 'PreprocessorDirective', value: token.value.trim() });
      current++;
    } else if (isTypeSpecifier(token)) {
      let funcNode = parseFunctionDefinition(tokens);
      if (funcNode) body.push(funcNode);
    } else {
      current++;
    }
  }
  return { type: 'Program', body };
}

function parseFunctionDefinition(tokens: any[]) {
  let returnType = tokens[current].value;
  current++;
  
  if (current >= tokens.length || tokens[current].type !== 'IDENTIFIER') {
    return { error: "Expected function name" };
  }
  
  let funcName = tokens[current].value;
  current++;

  if (current >= tokens.length || tokens[current].type !== 'OPEN_PAREN') {
    return { error: "Expected '(' after function name" };
  }
  current++; 

  let parameters: any[] = [];
  while (current < tokens.length && tokens[current].value !== ')') {
    if (tokens[current].value === ',') {
      current++;
      continue;
    }
    if (isTypeSpecifier(tokens[current])) {
      let paramType = tokens[current].value;
      current++;
      let paramName = tokens[current] ? tokens[current].value : "<missing id>";
      current++;
      parameters.push({ type: 'Parameter', paramType, paramName });
    } else {
      current++;
    }
  }
  
  if (current >= tokens.length) {
    return { error: "Unexpected end of input while parsing function parameters" };
  }
  
  current++; // Skip over ')'

  if (current >= tokens.length || tokens[current].type !== 'OPEN_BRACE') {
    return { error: "Expected '{' at beginning of function body" };
  }
  let bodyNode = parseCompoundStatement(tokens);
  return {
    type: 'FunctionDeclaration',
    returnType,
    name: funcName,
    parameters,
    body: bodyNode
  };
}

function parseCompoundStatement(tokens: any[]) {
  if (tokens[current].type !== 'OPEN_BRACE') {
    return { error: "Expected '{' at beginning of compound statement" };
  }
  let compound = { type: 'CompoundStatement', body: [] };
  current++;

  while (current < tokens.length && tokens[current].type !== 'CLOSE_BRACE') {
    let prev = current;
    let stmt = parseStatement(tokens);
    if (stmt && !stmt.error) {
      compound.body.push(stmt);
    } else if (stmt && stmt.error) {
      return stmt; // propagate error
    }
    // Prevent infinite loop: if parseStatement didn't consume any tokens, advance manually
    if (current === prev) current++;
  }
  if (current < tokens.length && tokens[current].type === 'CLOSE_BRACE') {
    current++;
  } else {
    return { error: "Expected '}' at end of compound statement" };
  }
  return compound;
}

function parseStatement(tokens: any[]) {
  if (current >= tokens.length) return null;
  let token = tokens[current];

  if (token.type === 'COMMENT') {
    current++;
    return null;
  }

  if (token.type === 'KEYWORD' && token.value === 'return') {
    return parseReturnStatement(tokens);
  } else if (token.type === 'KEYWORD' && token.value === 'if') {
    return parseIfStatement(tokens);
  } else if (token.type === 'KEYWORD' && token.value === 'for') {
    return parseForStatement(tokens);
  } else if (isTypeSpecifier(token)) {
    return parseDeclaration(tokens, true);
  } else if (token.type === 'OPEN_BRACE') {
    return parseCompoundStatement(tokens);
  } else {
    return parseExpressionStatement(tokens);
  }
}

function parseReturnStatement(tokens: any[]) {
  current++;
  let expr = parseExpression(tokens);
  if (current < tokens.length && tokens[current].type === 'SEPARATOR' && tokens[current].value === ';') {
    current++;
  }
  return { type: 'ReturnStatement', expression: expr };
}

function parseIfStatement(tokens: any[]) {
  current++;
  if (current >= tokens.length || tokens[current].type !== 'OPEN_PAREN') {
    return { error: "Expected '(' after if" };
  }
  current++;
  let prev = current;
  let condition = parseExpression(tokens);
  // DEBUG: Print current and condition after parsing expression
  console.log('parseIfStatement: after parseExpression, current =', current, 'condition =', JSON.stringify(condition));
  if (condition && condition.error) {
    return condition;
  }
  // Defensive: If parseExpression didn't advance, advance to avoid infinite loop
  if (current === prev) current++;
  if (current >= tokens.length || tokens[current].type !== 'CLOSE_PAREN') {
    return {
      error: "Expected ')' after if condition, got: " +
        (tokens[current] ? tokens[current].type + " '" + tokens[current].value + "'" : "end of input")
    };
  }
  current++;
  let thenStmt = parseStatement(tokens);
  let elseStmt = null;
  if (current < tokens.length && tokens[current].type === 'KEYWORD' && tokens[current].value === 'else') {
    current++;
    elseStmt = parseStatement(tokens);
  }
  return { type: 'IfStatement', condition, then: thenStmt, else: elseStmt };
}

function parseForStatement(tokens: any[]) {
  current++; 
  if (current >= tokens.length || tokens[current].type !== 'OPEN_PAREN') {
    return { error: "Expected '(' after for" };
  }
  current++; 

  let initialization = null;
  if (current < tokens.length && isTypeSpecifier(tokens[current])) {
    initialization = parseDeclaration(tokens, false);
  } else {
    initialization = parseExpression(tokens);
  }
  if (current < tokens.length && tokens[current].type === 'SEPARATOR' && tokens[current].value === ';') {
    current++;
  }

  let condition = parseExpression(tokens);
  if (current < tokens.length && tokens[current].type === 'SEPARATOR' && tokens[current].value === ';') {
    current++;
  }

  let increment = parseExpression(tokens);
  if (current >= tokens.length || tokens[current].type !== 'CLOSE_PAREN') {
    return { error: "Expected ')' after for increment" };
  }
  current++;

  let body = parseStatement(tokens);
  return {
    type: 'ForStatement',
    initialization,
    condition,
    increment,
    body
  };
}

function parseDeclaration(tokens: any[], expectSemicolon: boolean) {
  let varType = tokens[current].value;
  current++;
  const variables: any[] = [];
  while (true) {
    if (current >= tokens.length || tokens[current].type !== 'IDENTIFIER') {
      break;
    }
    let varName = tokens[current].value;
    current++;
    let initializer = null;
    if (current < tokens.length && tokens[current].value === '=') {
      current++;
      initializer = parseExpression(tokens);
    }
    variables.push({ type: "VariableDeclarator", name: varName, initializer });
    if (current >= tokens.length) break;
    if (tokens[current].value === ',') {
      current++;
      continue;
    }
    if (expectSemicolon && tokens[current].type === 'SEPARATOR' && tokens[current].value === ';') {
      current++;
      break;
    }
  }
  console.log('parseDeclaration: variables collected:', variables.map(v => v.name));
  const decl = {
    type: 'DeclarationStatement',
    varType,
    variables
  };
  console.log('parseDeclaration: returning DeclarationStatement:', JSON.stringify(decl));
  return decl;
}

function parseExpressionStatement(tokens: any[]) {
  let expr = parseExpression(tokens);
  if (current < tokens.length && tokens[current].type === 'SEPARATOR' && tokens[current].value === ';') {
    current++;
  }
  return { type: 'ExpressionStatement', expression: expr };
}

function parseExpression(tokens: any[]) {
  return parseAssignment(tokens);
}

function parseAssignment(tokens: any[]) {
  let left = parseEquality(tokens);
  if (current < tokens.length && tokens[current].value === '=') {
    let op = tokens[current].value;
    current++;
    let right = parseAssignment(tokens);
    return { type: 'AssignmentExpression', operator: op, left, right };
  }
  return left;
}

function parseEquality(tokens: any[]) {
  let left = parseRelational(tokens);
  while (
    current < tokens.length &&
    (tokens[current].type === 'OPERATOR') &&
    (tokens[current].value === '==' || tokens[current].value === '!=')
  ) {
    let op = tokens[current].value;
    current++;
    let right = parseRelational(tokens);
    left = { type: 'BinaryExpression', operator: op, left, right };
  }
  return left;
}

function parseRelational(tokens: any[]) {
  let left = parseAdditive(tokens);
  while (
    current < tokens.length &&
    (tokens[current].type === 'OPERATOR') &&
    ['<', '>', '<=', '>='].includes(tokens[current].value)
  ) {
    let op = tokens[current].value;
    current++;
    let right = parseAdditive(tokens);
    left = { type: 'BinaryExpression', operator: op, left, right };
  }
  return left;
}

function parseAdditive(tokens: any[]) {
  let left = parseMultiplicative(tokens);
  while (
    current < tokens.length &&
    (tokens[current].type === 'OPERATOR') &&
    (tokens[current].value === '+' || tokens[current].value === '-')
  ) {
    let op = tokens[current].value;
    current++;
    let right = parseMultiplicative(tokens);
    left = { type: 'BinaryExpression', operator: op, left, right };
  }
  return left;
}

function parseMultiplicative(tokens: any[]) {
  let left = parseUnary(tokens);
  while (
    current < tokens.length &&
    (tokens[current].type === 'OPERATOR') &&
    (tokens[current].value === '*' || tokens[current].value === '/' || tokens[current].value === '%')
  ) {
    let op = tokens[current].value;
    current++;
    let right = parseUnary(tokens);
    left = { type: 'BinaryExpression', operator: op, left, right };
  }
  return left;
}

function parseUnary(tokens: any[]) {
  if (current < tokens.length &&
      (tokens[current].value === '++' || tokens[current].value === '--')) {
    let op = tokens[current].value;
    current++;
    let argument = parseUnary(tokens);
    return { type: 'PrefixExpression', operator: op, argument };
  }
  return parsePostfix(tokens);
}

function parsePostfix(tokens: any[]) {
  let node = parsePrimary(tokens);
  while (current < tokens.length &&
         (tokens[current].value === '++' || tokens[current].value === '--')) {
    let op = tokens[current].value;
    current++;
    node = { type: 'PostfixExpression', operator: op, argument: node };
  }
  return node;
}

function parsePrimary(tokens: any[]) {
  if (current >= tokens.length) return null;
  let token = tokens[current];



  if (token.type === 'NUMBER' || token.type === 'STRING_LITERAL') {
    current++;
    return { type: 'Literal', value: token.value };
  }

  if (token.type === 'IDENTIFIER' || (token.type === 'KEYWORD' && !isTypeSpecifier(token))) {
    current++;
    let node = { type: 'Identifier', name: token.value };

    if (current < tokens.length && tokens[current].type === 'OPEN_PAREN') {
      current++;
      let args: any[] = [];
      while (current < tokens.length && tokens[current].type !== 'CLOSE_PAREN') {
        let arg = parseExpression(tokens);
        if (arg) args.push(arg);
        if (current < tokens.length && tokens[current].value === ',') {
          current++;
        }
      }
      if (current < tokens.length && tokens[current].type === 'CLOSE_PAREN') {
        current++;
      }
      return { type: 'FunctionCall', name: node.name, arguments: args };
    }
    return node;
  }

  if (token.type === 'OPEN_PAREN') {
    current++; 
    let expr = parseExpression(tokens);
    if (current < tokens.length && tokens[current].type === 'CLOSE_PAREN') {
      current++;
    }
    return expr;
  }

  // If token is not a valid primary, return null (do not increment current)
  return null;
}

// Render AST function
function renderAST(node: any): string {
  if (node === null) {
    return `<span class="ast-leaf ast-null">null</span>`;
  }
  if (typeof node !== 'object') {
    return `<span class="ast-leaf">${node}</span>`;
  }
  let html = '<ul>';
  if (Array.isArray(node)) {
    node.forEach(child => {
      html += `<li>${renderAST(child)}</li>`;
    });
  } else {
    html += `<li><span class="node-label">${node.type}</span>`;
    for (let key in node) {
      if (key === 'type') continue;
      html += `<ul><li><span class="node-key">${key}:</span> `;
      html += renderAST(node[key]);
      html += `</li></ul>`;
    }
    html += `</li>`;
  }
  html += '</ul>';
  return html;
}

// Index component
const Index = () => {
  const { toast } = useToast();
  const [code, setCode] = useState<string>(`#include <stdio.h>\n\nint main() {\n    int a = 5;\n    int b = 10;\n    int sum = a + b;\n    printf(\"Sum: %d\\n\", sum);\n    return 0;\n}`);
  const [tokens, setTokens] = useState<string>("");
  const [ast, setAST] = useState<string>("");
  const [semanticAnalysis, setSemanticAnalysis] = useState<string>("");
  const [intermediateCode, setIntermediateCode] = useState<string>("");
  const [optimizedCode, setOptimizedCode] = useState<string>("");

  // Auto-generate optimized code whenever intermediateCode changes
  useEffect(() => {
    if (intermediateCode) {
      try {
        // Parse AST string if needed
        let astObject = ast;
        if (typeof ast === 'string' && ast.trim().startsWith('{')) {
          astObject = JSON.parse(ast);
        }
        // Re-run the optimization pipeline
        const semanticAnalyzer = new SemanticAnalyzer();
        const intermediateGenerator = new IntermediateCodeGenerator(semanticAnalyzer);
        const functions = intermediateGenerator.generate(astObject);
        const optimizer = new CodeOptimizer(functions);
        const optimizedFunctions = optimizer.optimize();
        const formatted = formatOptimizedCode(optimizedFunctions);
        setOptimizedCode(
          formatted.trim() === 'Optimized Intermediate Code:'
            ? 'No optimized code generated. Please check your IR generation.'
            : formatted
        );
      } catch (error) {
        setOptimizedCode("[Optimization Error] " + (error instanceof Error ? error.message : "Unknown error"));
      }
    } else {
      setOptimizedCode("No intermediate code to optimize. Please generate IR first.");
    }
  }, [intermediateCode, ast]);

  // Manual Optimize button handler
  const handleOptimization = () => {
    if (!intermediateCode) {
      toast({
        title: "Error",
        description: "Please generate intermediate code first",
        variant: "destructive",
      });
      return;
    }
    try {
      let astObject = ast;
      if (typeof ast === 'string' && ast.trim().startsWith('{')) {
        astObject = JSON.parse(ast);
      }
      const semanticAnalyzer = new SemanticAnalyzer();
      const intermediateGenerator = new IntermediateCodeGenerator(semanticAnalyzer);
      const functions = intermediateGenerator.generate(astObject);
      const optimizer = new CodeOptimizer(functions);
      const optimizedFunctions = optimizer.optimize();
      const formatted = formatOptimizedCode(optimizedFunctions);
      setOptimizedCode(
        formatted.trim() === 'Optimized Intermediate Code:'
          ? 'No optimized code generated. Please check your IR generation.'
          : formatted
      );
      setActiveTab("optimized");
      toast({
        title: "Success",
        description: "Code optimized successfully",
      });
    } catch (error) {
      showError("Optimization", error instanceof Error ? error.message : "Failed to optimize code");
    }
  };

  // Manual Generate Assembly button handler
  const handleCodeGeneration = () => {
    if (!optimizedCode || optimizedCode.startsWith('No optimized code') || optimizedCode.startsWith('[Optimization Error]')) {
      toast({
        title: "Error",
        description: "Please optimize the code first",
        variant: "destructive",
      });
      return;
    }
    try {
      // Parse AST string if needed
      let astObject = ast;
      if (typeof ast === 'string' && ast.trim().startsWith('{')) {
        astObject = JSON.parse(ast);
      }
      const semanticAnalyzer = new SemanticAnalyzer();
      const intermediateGenerator = new IntermediateCodeGenerator(semanticAnalyzer);
      const functions = intermediateGenerator.generate(astObject);
      const optimizer = new CodeOptimizer(functions);
      const optimizedFunctions = optimizer.optimize();
      const generator = new CodeGenerator(optimizedFunctions);
      const assembly = generator.generate();
      setAssemblyCode(formatAssembly(assembly));
      setActiveTab("assembly");
      toast({
        title: "Success",
        description: "Assembly code generated successfully",
      });
    } catch (error) {
      showError("Assembly Code Generation", error instanceof Error ? error.message : "Failed to generate assembly code");
    }
  };
  const [assemblyCode, setAssemblyCode] = useState<string>("");
  const [output, setOutput] = useState<string>("");
  const [activeTab, setActiveTab] = useState("tokens");

  // Output button handler
  const handleOutput = () => {
    if (!assemblyCode || assemblyCode.startsWith('No assembly code')) {
      toast({
        title: "Error",
        description: "Please generate assembly code first",
        variant: "destructive",
      });
      return;
    }
    // Simulate output (in a real compiler, this would run the code)
    // For now, just mock output for demonstration
    const mockOutput = "Program executed successfully!\nOutput: Sum: 15\n";
    setOutput(mockOutput);
    setActiveTab("output");
    toast({
      title: "Success",
      description: "Program output generated",
    });
  };
  const [editorError, setEditorError] = useState<string>("");
  const [errorStage, setErrorStage] = useState<string>("");
  const [highlightedOutput, setHighlightedOutput] = useState<{ [key: string]: string }>({});
  const outputRefs = {
    tokens: useRef<HTMLPreElement>(null),
    ast: useRef<HTMLPreElement>(null),
    semantic: useRef<HTMLPreElement>(null),
    ir: useRef<HTMLPreElement>(null),
    optimized: useRef<HTMLPreElement>(null),
    assembly: useRef<HTMLPreElement>(null),
    output: useRef<HTMLPreElement>(null),
  };
  const monacoRef = useRef<any>(null);

  // Error explanation mapping
  const getErrorExplanation = (message: string) => {
    if (/expected ['`]?;['`]?/i.test(message) || /missing semicolon/i.test(message)) {
      return "You may have missed a semicolon at the end of a statement. Add ';' where required.";
    }
    if (/not declared/i.test(message)) {
      return "You are using a variable or function that hasn't been declared. Declare it before use.";
    }
    if (/unexpected end of input/i.test(message)) {
      return "Your code is incomplete. Check for missing braces, parentheses, or unfinished statements.";
    }
    if (/function '(.+)' expects (\d+) arguments but got (\d+)/i.test(message)) {
      return "Check the number of arguments you are passing to the function and match it with its definition.";
    }
    if (/unknown type/i.test(message)) {
      return "You may have used an invalid or unsupported type. Check your type names.";
    }
    if (/parse/i.test(message)) {
      return "There may be a syntax error in your code. Check for typos, missing symbols, or misplaced keywords.";
    }
    // Add more patterns as needed
    return "Check your code for syntax, declaration, or logic errors. If unsure, review the error message above.";
  };

  // Error handler
  const showError = (stage: string, message: string) => {
    setErrorStage(stage);
    const explanation = getErrorExplanation(message);
    setEditorError(`${message}\n\nHow to fix: ${explanation}`);
  };

  useEffect(() => {
    loader.init().then(monaco => {
      monacoRef.current = monaco;
    });
  }, []);

  useEffect(() => {
    const highlight = async (tab: string, value: string, lang: string) => {
      if (monacoRef.current && value) {
        const html = await monacoRef.current.editor.colorize(value, lang, {});
        setHighlightedOutput((prev) => ({ ...prev, [tab]: html }));
      }
    };
    highlight('tokens', tokens, 'cpp');
    highlight('ast', ast, 'json');
    highlight('semantic', semanticAnalysis, 'json');
    highlight('ir', intermediateCode, 'cpp');
    highlight('optimized', optimizedCode, 'cpp');
    highlight('assembly', assemblyCode, 'asm');
    highlight('output', output, 'plaintext');
  }, [tokens, ast, semanticAnalysis, intermediateCode, optimizedCode, assemblyCode, output]);

  const handleTokenize = () => {
    try {
      const newTokens = tokenize(code);
      setTokens(newTokens.map(token => token.value).join('\n'));
      setActiveTab("tokens");
      setEditorError("");
      toast({ title: "Tokenization Successful", description: `Generated ${newTokens.length} tokens` });
    } catch (error) {
      showError("Tokenization", error instanceof Error ? error.message : String(error));
      toast({ variant: "destructive", title: "Tokenization Failed", description: error instanceof Error ? error.message : "Unknown error" });
    }
  };

  const handleParse = () => {
    try {
      const newTokens = tokenize(code);
      setTokens(newTokens.map(token => token.value).join('\n'));
      // DEBUG: Print tokens for inspection
      console.log('TOKENS:', newTokens.map(token => `${token.type}: '${token.value}'`).join('\n'));
      const newAst = parse(newTokens);
      setAST(JSON.stringify(newAst, null, 2));
      setActiveTab("ast");
      toast({
        title: "Parsing Successful",
        description: "Abstract Syntax Tree generated",
      });
    } catch (error) {
      console.error("Parsing error:", error);
      showError("Parsing", error instanceof Error ? error.message : "Unknown error");
    }
  };

  const formatSemanticResults = (results: any) => {
    console.log('=== Formatting Semantic Results ===');
    
    let output = '';
    
    // Debug: Log the input results
    console.log('Raw results:', {
      hasFunctionTable: !!results.functionTable,
      hasSymbolTable: !!results.symbolTable,
      errors: results.errors?.length || 0
    });
    
    // Helper function to safely convert Map to object
    const safeConvertMap = (map: any) => {
      if (!map) return {};
      try {
        if (map instanceof Map) {
          return Object.fromEntries(map.entries());
        } else if (typeof map === 'object') {
          return { ...map };
        }
      } catch (error) {
        console.error('Error converting map:', error);
      }
      return {};
    };
    
    // Convert tables
    const functionTable = safeConvertMap(results.functionTable);
    const symbolTable = safeConvertMap(results.symbolTable);
    
    console.log('Converted function table:', functionTable);
    console.log('Converted symbol table:', symbolTable);
    
    // Log all function keys for debugging
    const functionKeys = Object.keys(functionTable);
    console.log(`Found ${functionKeys.length} functions:`, functionKeys);
    
    // Debug: Log the converted tables
    console.log('Converted functionTable:', functionTable);
    console.log('Converted symbolTable:', symbolTable);
    
    // Format function table
    output += '=== FUNCTION TABLE ===\n\n';
    
    // Define types for function entries
    interface FunctionParam {
      name?: string;
      type?: string;
      isParam?: boolean;
    }

    interface FunctionInfo {
      name?: string;
      params?: FunctionParam[];
      returnType?: string;
      isStandardLibrary?: boolean;
    }

    // Get all function entries with type assertion
    const functionEntries = Object.entries(functionTable) as [string, FunctionInfo][];
    
    console.log('Raw function entries:', functionEntries);
    
    if (functionEntries.length > 0) {
      // Table header
      output += 'Name'.padEnd(20) + 'Return Type'.padEnd(15) + 'Parameters\n';
      output += '-'.repeat(60) + '\n';
      
      // Process each function
      for (const [funcName, funcInfo] of functionEntries) {
        if (!funcInfo) {
          console.log('Skipping invalid function entry:', funcName);
          continue;
        }
        
        try {
          // Safely get parameters
          let paramsDisplay = '()';
          if (funcInfo.params && Array.isArray(funcInfo.params) && funcInfo.params.length > 0) {
            const paramStrings = funcInfo.params.map(p => {
              const type = p?.type || 'int';
              const name = p?.name || 'unnamed';
              return `${type} ${name}`;
            });
            paramsDisplay = `(${paramStrings.join(', ')})`;
          }
          
          // Get return type with default
          const returnType = funcInfo.returnType || 'int';
          
          // Add to output
          output += `${String(funcName).padEnd(20)}`;
          output += `${String(returnType).padEnd(15)}`;
          output += `${paramsDisplay}\n`;
          
        } catch (error) {
          console.error(`Error processing function ${funcName}:`, error);
          output += `${String(funcName).padEnd(20)}<error processing function>\n`;
        }
      }
    } else {
      output += 'No functions defined\n';
    }
    
    // Format symbol table
    output += '\n=== SYMBOL TABLE ===\n\n';
    const symbolEntries = Object.entries(symbolTable);
    
    if (symbolEntries.length > 0) {
      output += 'Name'.padEnd(20) + 'Type'.padEnd(15) + 'Scope'.padEnd(15) + 'Is Parameter\n';
      output += '-'.repeat(60) + '\n';
      
      symbolEntries.forEach(([name, symbol]: [string, any]) => {
        output += `${name.padEnd(20)}`;
        output += `${(symbol.type || 'unknown').toString().padEnd(15)}`;
        output += `${(symbol.scope || 'global').toString().padEnd(15)}`;
        output += `${symbol.isParam ? 'Yes' : 'No'}\n`;
      });
    } else {
      output += 'No symbols defined\n';
    }
    
    // Show errors if any
    if (results.errors && results.errors.length > 0) {
      output += '\n=== ERRORS ===\n\n';
      results.errors.forEach((error: string) => {
        output += `• ${error}\n`;
      });
    }
    
    return output;
  };

  const handleSemanticAnalysis = () => {
    try {
      const newTokens = tokenize(code);
      setTokens(newTokens.map(token => token.value).join('\n'));
      const newAst = parse(newTokens);
      setAST(JSON.stringify(newAst, null, 2));
      
      const semanticAnalyzer = new SemanticAnalyzer();
      const results = semanticAnalyzer.analyze(newAst);
      
      // Debug logging
      console.log('Semantic Analysis Results:', {
        symbolTable: results.symbolTable instanceof Map ? 'Map' : 'Not a Map',
        symbolTableSize: results.symbolTable?.size,
        functionTable: results.functionTable instanceof Map ? 'Map' : 'Not a Map',
        functionTableSize: results.functionTable?.size,
        errors: results.errors
      });
      
      // Format the results for display
      const displayResults = formatSemanticResults(results);
      setSemanticAnalysis(displayResults);
      setActiveTab("semantic");
      
      const errorCount = results.errors.length;
      if (errorCount > 0) {
        toast({
          variant: "destructive",
          title: "Semantic Analysis Completed",
          description: `Found ${errorCount} semantic error${errorCount === 1 ? '' : 's'}`,
        });
      } else {
        toast({
          title: "Semantic Analysis Successful",
          description: "No semantic errors found",
        });
      }
    } catch (error) {
      console.error("Semantic analysis error:", error);
      showError("Semantic Analysis", error instanceof Error ? error.message : "Unknown error");
    }
  };

  const handleIntermediateCode = () => {
    try {
      if (!ast) {
        toast({
          title: "Error",
          description: "Please parse the code first",
          variant: "destructive",
        });
        return;
      }

      // Parse the AST string back into an object
      const astObject = JSON.parse(ast);
      console.log('AST Object:', astObject); // Debug log

      // Create semantic analyzer and analyze the AST
      const semanticAnalyzer = new SemanticAnalyzer();
      const analysis = semanticAnalyzer.analyze(astObject);
      console.log('Semantic Analysis:', analysis); // Debug log

      // Check for semantic errors
      if (analysis.errors.length > 0) {
        const errorMessage = analysis.errors.join('\n');
        console.log('Semantic Errors:', errorMessage); // Debug log
        toast({
          title: "Semantic Errors Found",
          description: errorMessage,
          variant: "destructive",
        });
        setIntermediateCode('Semantic errors found:\n' + errorMessage);
        return;
      }

      // Generate intermediate code
      const intermediateGenerator = new IntermediateCodeGenerator(semanticAnalyzer);
      const intermediateCode = intermediateGenerator.generate(astObject);
      console.log('Generated IR:', intermediateCode); // Debug log

      // Format and display the intermediate code
      const formattedCode = formatTAC(intermediateCode);
      setIntermediateCode(formattedCode);
      setActiveTab("ir");
      
      toast({
        title: "Success",
        description: "Intermediate code generated successfully",
      });
    } catch (error) {
      console.error('Error generating intermediate code:', error);
      showError("Intermediate Code Generation", error instanceof Error ? error.message : String(error));
      setIntermediateCode('Error generating intermediate code: ' + (error instanceof Error ? error.message : String(error)));
    }
  };



  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-black via-blue-950 to-blue-900 text-blue-100 font-sans animate-fade-in">
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8 text-center">
          <h1 className="text-5xl font-extrabold tracking-tight text-blue-400 mb-2 drop-shadow-lg">Edu Compiler</h1>
          <p className="text-lg text-blue-200">Interactive C Compiler Visualization Platform</p>
        </div>
        <div className="flex flex-col gap-8">
          <div className="flex flex-col lg:flex-row gap-8">
            <Card className="flex-1 bg-gradient-to-br from-black via-blue-950 to-blue-900 border-blue-800 shadow-xl rounded-2xl">
              <CardHeader>
                <CardTitle className="text-blue-300">Code Input</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <MonacoEditor
                    height="400px"
                    defaultLanguage="c"
                    theme="vs-dark"
                    value={code}
                    onChange={(value) => setCode(value || "")}
                    options={{
                      fontSize: 16,
                      fontFamily: 'Fira Mono, monospace',
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      wordWrap: 'on',
                      lineNumbers: 'on',
                      automaticLayout: true,
                      formatOnType: true,
                      formatOnPaste: true,
                      cursorSmoothCaretAnimation: 'on',
                      scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
                    }}
                  />
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Button onClick={handleTokenize} variant="outline" className="bg-black text-blue-400 border-blue-700 hover:bg-blue-900 hover:text-white">Tokenize</Button>
                  <Button onClick={handleParse} variant="outline" className="bg-black text-blue-400 border-blue-700 hover:bg-blue-900 hover:text-white">Parse</Button>
                  <Button onClick={handleSemanticAnalysis} variant="outline" className="bg-black text-blue-400 border-blue-700 hover:bg-blue-900 hover:text-white">Analyze Semantics</Button>
                  <Button onClick={handleIntermediateCode} variant="outline" className="bg-black text-blue-400 border-blue-700 hover:bg-blue-900 hover:text-white">Generate IR</Button>
                  <Button onClick={handleOptimization} variant="outline" className="bg-black text-orange-400 border-orange-700 hover:bg-orange-900 hover:text-white">Optimize</Button>
                  <Button onClick={handleCodeGeneration} variant="outline" className="bg-black text-red-400 border-red-700 hover:bg-red-900 hover:text-white">Generate Assembly</Button>
                  <Button onClick={handleOutput} variant="outline" className="bg-black text-emerald-400 border-emerald-700 hover:bg-emerald-900 hover:text-white">Output</Button>
                </div>
              </CardContent>
            </Card>
            <div className="w-full lg:w-[350px] flex-shrink-0">
              <div className="h-full flex flex-col justify-start">
                <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900 to-black text-blue-200 border-2 border-blue-700 shadow-2xl min-h-[120px] animate-fade-in">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl mt-1">❗</div>
                    <div className="flex-1">
                      <div className="font-bold text-blue-300 text-lg mb-1">Error Explanation</div>
                      {editorError ? (
                        <div className="whitespace-pre-line text-sm">{editorError}</div>
                      ) : (
                        <div className="text-sm text-blue-400">No errors detected. Your code looks good!\nTip: Use the buttons below to analyze your code and see results here if any issues are found.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <Card className="bg-gradient-to-br from-black via-blue-950 to-blue-900 border-blue-800 shadow-xl rounded-2xl w-full">
            <CardHeader>
              <CardTitle className="text-blue-300">Output</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="animate-fade-in">
                <TabsList className="grid grid-cols-7 mb-4 bg-black/60 rounded-xl">
                  <TabsTrigger value="tokens" className="data-[state=active]:bg-blue-500 data-[state=active]:text-white">
                    Tokens
                  </TabsTrigger>
                  <TabsTrigger value="ast" className="data-[state=active]:bg-purple-500 data-[state=active]:text-white">
                    AST
                  </TabsTrigger>
                  <TabsTrigger value="semantic" className="data-[state=active]:bg-amber-500 data-[state=active]:text-white">
                    Semantic
                  </TabsTrigger>
                  <TabsTrigger value="ir" className="data-[state=active]:bg-green-500 data-[state=active]:text-white">
                    IR
                  </TabsTrigger>
                  <TabsTrigger value="optimized" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">
                    Optimized
                  </TabsTrigger>
                  <TabsTrigger value="assembly" className="data-[state=active]:bg-red-500 data-[state=active]:text-white">
                    Assembly
                  </TabsTrigger>
                  <TabsTrigger value="output" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
                    Output
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="tokens" className="mt-0">
                  <div className="bg-black/80 p-4 rounded-xl">
                    <pre ref={outputRefs.tokens} className="text-sm font-mono overflow-x-auto whitespace-pre-wrap" dangerouslySetInnerHTML={{__html: highlightedOutput.tokens || (tokens || "No tokens generated yet")}} />
                  </div>
                </TabsContent>
                <TabsContent value="ast" className="mt-0">
                  <div className="bg-black/80 p-4 rounded-xl">
                    <pre ref={outputRefs.ast} className="text-sm font-mono overflow-x-auto whitespace-pre-wrap" dangerouslySetInnerHTML={{__html: highlightedOutput.ast || (ast || "No AST generated yet")}} />
                  </div>
                </TabsContent>
                <TabsContent value="semantic" className="mt-0">
                  <div className="bg-black/80 p-4 rounded-xl">
                    <pre ref={outputRefs.semantic} className="text-sm font-mono overflow-x-auto whitespace-pre-wrap" dangerouslySetInnerHTML={{__html: highlightedOutput.semantic || (semanticAnalysis || "No semantic analysis performed yet")}} />
                  </div>
                </TabsContent>
                <TabsContent value="ir" className="mt-0">
                  <div className="bg-black/80 p-4 rounded-xl">
                    <pre ref={outputRefs.ir} className="text-sm font-mono overflow-x-auto whitespace-pre-wrap" dangerouslySetInnerHTML={{__html: highlightedOutput.ir || (intermediateCode || "No intermediate code generated yet")}} />
                  </div>
                </TabsContent>
                <TabsContent value="optimized" className="mt-0">
                  <div className="bg-black/80 p-4 rounded-xl">
                    <pre ref={outputRefs.optimized} className="text-sm font-mono overflow-x-auto whitespace-pre-wrap" dangerouslySetInnerHTML={{__html: highlightedOutput.optimized || (optimizedCode || "No optimized code generated yet")}} />
                  </div>
                </TabsContent>
                <TabsContent value="assembly" className="mt-0">
                  <div className="bg-black/80 p-4 rounded-xl">
                    <pre ref={outputRefs.assembly} className="text-sm font-mono overflow-x-auto whitespace-pre-wrap" dangerouslySetInnerHTML={{__html: highlightedOutput.assembly || (assemblyCode || "No assembly code generated yet")}} />
                  </div>
                </TabsContent>
                <TabsContent value="output" className="mt-0">
                  <div className="bg-black/80 p-4 rounded-xl">
                    <pre ref={outputRefs.output} className="text-sm font-mono overflow-x-auto whitespace-pre-wrap" dangerouslySetInnerHTML={{__html: highlightedOutput.output || (output || "No program output available yet")}} />
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Index;
