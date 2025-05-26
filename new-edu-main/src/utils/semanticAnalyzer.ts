
// Type definitions for our semantic analyzer
type SymbolType = 'int' | 'float' | 'double' | 'char' | 'void' | 'string';

interface SymbolInfo {
  name: string;
  type: SymbolType;
  scope: string;
  isInitialized: boolean;
  line?: number;
}

interface FunctionInfo {
  name: string;
  returnType: SymbolType;
  parameters: SymbolInfo[];
  isDefined: boolean;
}

class SemanticError {
  message: string;
  node: any;

  constructor(message: string, node: any) {
    this.message = message;
    this.node = node;
  }
}

// Main class for semantic analysis
export class SemanticAnalyzer {
  symbolTable: Record<string, SymbolInfo[]> = {};
  functionTable: Record<string, FunctionInfo> = {};
  currentScope: string = "global";
  errors: SemanticError[] = [];
  
  constructor() {
    this.reset();
  }

  reset() {
    this.symbolTable = {};
    this.functionTable = {};
    this.currentScope = "global";
    this.errors = [];
  }

  // Main entry point for analysis
  analyze(ast: any): { symbolTable: any, functionTable: any, errors: SemanticError[] } {
    this.reset();
    
    if (ast && ast.type === 'Program') {
      this.analyzeProgram(ast);
    }
    
    return {
      symbolTable: this.symbolTable,
      functionTable: this.functionTable,
      errors: this.errors
    };
  }

  private analyzeProgram(program: any) {
    for (const node of program.body) {
      if (node.type === 'FunctionDeclaration') {
        this.analyzeFunction(node);
      } else if (node.type === 'PreprocessorDirective') {
        // No semantic analysis needed for preprocessor directives
        continue;
      }
    }
  }

  private analyzeFunction(funcNode: any) {
    const funcName = funcNode.name;
    const returnType = this.convertToSymbolType(funcNode.returnType);
    
    // Create a new scope for the function
    this.currentScope = funcName;
    
    // Add function to function table
    const params = funcNode.parameters.map((param: any) => {
      const symbolInfo: SymbolInfo = {
        name: param.paramName,
        type: this.convertToSymbolType(param.paramType),
        scope: this.currentScope,
        isInitialized: true // Parameters are considered initialized
      };
      
      // Add parameter to symbol table
      this.addSymbol(symbolInfo);
      
      return symbolInfo;
    });
    
    this.functionTable[funcName] = {
      name: funcName,
      returnType,
      parameters: params,
      isDefined: true
    };
    
    // Analyze function body
    if (funcNode.body && funcNode.body.type === 'CompoundStatement') {
      this.analyzeCompoundStatement(funcNode.body);
    }
    
    // Check if return statement exists for non-void functions
    if (returnType !== 'void' && !this.hasReturnStatement(funcNode.body)) {
      this.errors.push(new SemanticError(
        `Function "${funcName}" must return a value of type ${returnType}`,
        funcNode
      ));
    }
    
    // Restore scope
    this.currentScope = "global";
  }
  
  private hasReturnStatement(node: any): boolean {
    if (!node || !node.body) return false;
    
    for (const stmt of node.body) {
      if (stmt.type === 'ReturnStatement') {
        return true;
      } else if (stmt.type === 'CompoundStatement') {
        if (this.hasReturnStatement(stmt)) {
          return true;
        }
      } else if (stmt.type === 'IfStatement') {
        const thenHasReturn = stmt.then && this.hasReturnStatement({ body: [stmt.then] });
        const elseHasReturn = stmt.else && this.hasReturnStatement({ body: [stmt.else] });
        
        if (thenHasReturn && elseHasReturn) {
          return true;
        }
      }
    }
    
    return false;
  }

  private analyzeCompoundStatement(node: any) {
    if (!node.body) return;
    
    for (const stmt of node.body) {
      this.analyzeStatement(stmt);
    }
  }

  private analyzeStatement(stmt: any) {
    if (!stmt) return;
    
    switch (stmt.type) {
      case 'DeclarationStatement':
        this.analyzeDeclaration(stmt);
        break;
        
      case 'ExpressionStatement':
        this.analyzeExpression(stmt.expression);
        break;
        
      case 'ReturnStatement':
        this.analyzeReturnStatement(stmt);
        break;
        
      case 'IfStatement':
        this.analyzeIfStatement(stmt);
        break;
        
      case 'ForStatement':
        this.analyzeForStatement(stmt);
        break;
        
      case 'CompoundStatement':
        // Create a new scope for compound statements
        const oldScope = this.currentScope;
        this.currentScope = `${oldScope}.block${Date.now()}`;
        
        this.analyzeCompoundStatement(stmt);
        
        // Restore scope
        this.currentScope = oldScope;
        break;
    }
  }

  private analyzeDeclaration(node: any) {
    const varType = this.convertToSymbolType(node.varType);
    
    for (const variable of node.variables) {
      const symbolInfo: SymbolInfo = {
        name: variable.name,
        type: varType,
        scope: this.currentScope,
        isInitialized: variable.initializer !== null
      };
      
      // Check if variable is already declared in the same scope
      if (this.isSymbolDeclaredInCurrentScope(symbolInfo.name)) {
        this.errors.push(new SemanticError(
          `Variable "${symbolInfo.name}" is already declared in this scope`,
          variable
        ));
      } else {
        this.addSymbol(symbolInfo);
      }
      
      // Check initializer if it exists
      if (variable.initializer) {
        const initializerType = this.getExpressionType(variable.initializer);
        
        if (initializerType && initializerType !== varType) {
          this.errors.push(new SemanticError(
            `Cannot initialize variable of type "${varType}" with value of type "${initializerType}"`,
            variable
          ));
        }
      }
    }
  }

  private analyzeReturnStatement(node: any) {
    const functionInfo = this.functionTable[this.currentScope];
    
    if (!functionInfo) {
      this.errors.push(new SemanticError(
        "Return statement outside of function",
        node
      ));
      return;
    }
    
    if (!node.expression && functionInfo.returnType !== 'void') {
      this.errors.push(new SemanticError(
        `Function "${functionInfo.name}" must return a value of type ${functionInfo.returnType}`,
        node
      ));
      return;
    }
    
    if (node.expression) {
      const exprType = this.getExpressionType(node.expression);
      
      if (exprType && exprType !== functionInfo.returnType) {
        this.errors.push(new SemanticError(
          `Function "${functionInfo.name}" should return ${functionInfo.returnType}, but got ${exprType}`,
          node
        ));
      }
    }
  }

  private analyzeIfStatement(node: any) {
    // Check condition
    if (node.condition) {
      this.analyzeExpression(node.condition);
    }
    
    // Analyze then branch
    if (node.then) {
      this.analyzeStatement(node.then);
    }
    
    // Analyze else branch
    if (node.else) {
      this.analyzeStatement(node.else);
    }
  }

  private analyzeForStatement(node: any) {
    // Create a new scope for the for loop
    const oldScope = this.currentScope;
    this.currentScope = `${oldScope}.for${Date.now()}`;
    
    // Analyze initialization
    if (node.initialization) {
      if (node.initialization.type === 'DeclarationStatement') {
        this.analyzeDeclaration(node.initialization);
      } else {
        this.analyzeExpression(node.initialization);
      }
    }
    
    // Analyze condition
    if (node.condition) {
      this.analyzeExpression(node.condition);
    }
    
    // Analyze increment
    if (node.increment) {
      this.analyzeExpression(node.increment);
    }
    
    // Analyze body
    if (node.body) {
      this.analyzeStatement(node.body);
    }
    
    // Restore scope
    this.currentScope = oldScope;
  }

  private analyzeExpression(expr: any): SymbolType | null {
    if (!expr) return null;
    
    switch (expr.type) {
      case 'AssignmentExpression':
        return this.analyzeAssignmentExpression(expr);
        
      case 'BinaryExpression':
        return this.analyzeBinaryExpression(expr);
        
      case 'Identifier':
        return this.analyzeIdentifier(expr);
        
      case 'Literal':
        return this.inferLiteralType(expr.value);
        
      case 'FunctionCall':
        return this.analyzeFunctionCall(expr);
        
      case 'PrefixExpression':
      case 'PostfixExpression':
        return this.analyzeUnaryExpression(expr);
    }
    
    return null;
  }

  private analyzeAssignmentExpression(expr: any): SymbolType | null {
    // Check if left side is an identifier
    if (expr.left.type !== 'Identifier') {
      this.errors.push(new SemanticError(
        "Left side of assignment must be a variable",
        expr
      ));
      return null;
    }
    
    // Check if variable exists
    const varName = expr.left.name;
    const varInfo = this.findSymbol(varName);
    
    if (!varInfo) {
      this.errors.push(new SemanticError(
        `Variable "${varName}" is not declared`,
        expr.left
      ));
      return null;
    }
    
    // Mark variable as initialized
    varInfo.isInitialized = true;
    
    // Check right side type
    const rightType = this.getExpressionType(expr.right);
    
    if (rightType && rightType !== varInfo.type) {
      this.errors.push(new SemanticError(
        `Cannot assign value of type "${rightType}" to variable of type "${varInfo.type}"`,
        expr
      ));
    }
    
    return varInfo.type;
  }

  private analyzeBinaryExpression(expr: any): SymbolType | null {
    const leftType = this.getExpressionType(expr.left);
    const rightType = this.getExpressionType(expr.right);
    
    if (!leftType || !rightType) return null;
    
    // Type checking for binary operations
    if (['*', '/', '%', '+', '-'].includes(expr.operator)) {
      if (leftType === 'string' && expr.operator === '+' && rightType === 'string') {
        return 'string';
      }
      
      if (!this.isNumericType(leftType) || !this.isNumericType(rightType)) {
        this.errors.push(new SemanticError(
          `Operator "${expr.operator}" cannot be applied to types "${leftType}" and "${rightType}"`,
          expr
        ));
        return null;
      }
      
      // Return the "wider" numeric type
      return this.getWiderType(leftType, rightType);
    }
    
    // Type checking for comparison operations
    if (['<', '>', '<=', '>=', '==', '!='].includes(expr.operator)) {
      if (leftType !== rightType && 
          !(this.isNumericType(leftType) && this.isNumericType(rightType))) {
        this.errors.push(new SemanticError(
          `Cannot compare values of types "${leftType}" and "${rightType}"`,
          expr
        ));
      }
      
      // Comparison operations always return int (boolean)
      return 'int';
    }
    
    return null;
  }

  private analyzeIdentifier(expr: any): SymbolType | null {
    const varName = expr.name;
    const varInfo = this.findSymbol(varName);
    
    if (!varInfo) {
      this.errors.push(new SemanticError(
        `Variable "${varName}" is not declared`,
        expr
      ));
      return null;
    }
    
    if (!varInfo.isInitialized) {
      this.errors.push(new SemanticError(
        `Variable "${varName}" is used before initialization`,
        expr
      ));
    }
    
    return varInfo.type;
  }

  private analyzeFunctionCall(expr: any): SymbolType | null {
    const funcName = expr.name;
    const funcInfo = this.functionTable[funcName];
    
    if (!funcInfo) {
      // Special case for built-in functions like printf
      if (funcName === 'printf') {
        return 'int'; // printf returns int
      }
      
      this.errors.push(new SemanticError(
        `Function "${funcName}" is not declared`,
        expr
      ));
      return null;
    }
    
    // Check argument count
    if (expr.arguments.length !== funcInfo.parameters.length) {
      this.errors.push(new SemanticError(
        `Function "${funcName}" expects ${funcInfo.parameters.length} arguments, but got ${expr.arguments.length}`,
        expr
      ));
    } else {
      // Check argument types
      for (let i = 0; i < expr.arguments.length; i++) {
        const argType = this.getExpressionType(expr.arguments[i]);
        const paramType = funcInfo.parameters[i].type;
        
        if (argType && argType !== paramType) {
          this.errors.push(new SemanticError(
            `Argument ${i+1} of function "${funcName}" should be of type ${paramType}, but got ${argType}`,
            expr.arguments[i]
          ));
        }
      }
    }
    
    return funcInfo.returnType;
  }

  private analyzeUnaryExpression(expr: any): SymbolType | null {
    const argType = this.getExpressionType(expr.argument);
    
    if (!argType) return null;
    
    if (!this.isNumericType(argType)) {
      this.errors.push(new SemanticError(
        `Operator "${expr.operator}" cannot be applied to type "${argType}"`,
        expr
      ));
      return null;
    }
    
    return argType;
  }

  // Helper methods
  private getExpressionType(expr: any): SymbolType | null {
    return this.analyzeExpression(expr);
  }

  private inferLiteralType(value: string): SymbolType {
    if (value.startsWith('"')) {
      return 'string';
    }
    
    if (value.includes('.') || value.includes('e') || value.includes('E')) {
      return 'float';
    }
    
    return 'int';
  }

  private isNumericType(type: SymbolType): boolean {
    return ['int', 'float', 'double'].includes(type);
  }

  private getWiderType(type1: SymbolType, type2: SymbolType): SymbolType {
    if (type1 === 'double' || type2 === 'double') return 'double';
    if (type1 === 'float' || type2 === 'float') return 'float';
    return 'int';
  }

  private addSymbol(symbolInfo: SymbolInfo) {
    if (!this.symbolTable[this.currentScope]) {
      this.symbolTable[this.currentScope] = [];
    }
    
    this.symbolTable[this.currentScope].push(symbolInfo);
  }

  private findSymbol(name: string): SymbolInfo | null {
    // First check current scope
    const currentScopeSymbols = this.symbolTable[this.currentScope];
    if (currentScopeSymbols) {
      const symbol = currentScopeSymbols.find(s => s.name === name);
      if (symbol) return symbol;
    }
    
    // Then check global scope if we're not already in global
    if (this.currentScope !== "global") {
      const globalSymbols = this.symbolTable["global"];
      if (globalSymbols) {
        const symbol = globalSymbols.find(s => s.name === name);
        if (symbol) return symbol;
      }
    }
    
    return null;
  }

  private isSymbolDeclaredInCurrentScope(name: string): boolean {
    const currentScopeSymbols = this.symbolTable[this.currentScope];
    if (!currentScopeSymbols) return false;
    
    return currentScopeSymbols.some(s => s.name === name);
  }

  private convertToSymbolType(typeStr: string): SymbolType {
    switch (typeStr) {
      case 'int': return 'int';
      case 'float': return 'float';
      case 'double': return 'double';
      case 'char': return 'char';
      case 'void': return 'void';
      default: return 'int'; // Default to int for unknown types
    }
  }
}

// Create a function to render semantic analysis results
export function renderSemanticAnalysis(semanticResults: any): string {
  let html = '';
  
  // Add symbol table
  html += '<div class="semantic-section">';
  html += '<h3>Symbol Table</h3>';
  html += '<div class="table-container">';
  html += '<table>';
  html += '<thead><tr><th>Scope</th><th>Name</th><th>Type</th><th>Initialized</th></tr></thead>';
  html += '<tbody>';
  
  for (const scope in semanticResults.symbolTable) {
    const symbols = semanticResults.symbolTable[scope];
    for (const symbol of symbols) {
      html += `<tr>
        <td>${scope}</td>
        <td>${symbol.name}</td>
        <td>${symbol.type}</td>
        <td>${symbol.isInitialized ? 'Yes' : 'No'}</td>
      </tr>`;
    }
  }
  
  html += '</tbody></table></div></div>';
  
  // Add function table
  html += '<div class="semantic-section">';
  html += '<h3>Function Table</h3>';
  html += '<div class="table-container">';
  html += '<table>';
  html += '<thead><tr><th>Name</th><th>Return Type</th><th>Parameters</th></tr></thead>';
  html += '<tbody>';
  
  for (const funcName in semanticResults.functionTable) {
    const func = semanticResults.functionTable[funcName];
    const params = func.parameters.map(p => `${p.type} ${p.name}`).join(', ');
    
    html += `<tr>
      <td>${funcName}</td>
      <td>${func.returnType}</td>
      <td>${params}</td>
    </tr>`;
  }
  
  html += '</tbody></table></div></div>';
  
  // Add semantic errors
  html += '<div class="semantic-section">';
  html += '<h3>Semantic Errors</h3>';
  
  if (semanticResults.errors.length === 0) {
    html += '<p class="success-message">No semantic errors found!</p>';
  } else {
    html += '<ul class="error-list">';
    for (const error of semanticResults.errors) {
      html += `<li class="error-item">${error.message}</li>`;
    }
    html += '</ul>';
  }
  
  html += '</div>';
  
  return html;
}
