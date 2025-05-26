export class SemanticAnalyzer {
  private currentFunctionScope: string | null = null;
  private symbolTable: Map<string, any> = new Map();
  private functionTable: Map<string, any> = new Map();
  private errors: string[] = [];
  private globalSymbolTable: Map<string, any> = new Map();

  private addStandardLibraryFunctions() {
    console.log('Adding standard library functions...');

    const stdlibFunctions = [
      {
        name: 'printf',
        params: [{ name: 'format', type: 'char*' }],
        returnType: 'int',
        isStandardLibrary: true
      },
      {
        name: 'scanf',
        params: [{ name: 'format', type: 'char*' }],
        returnType: 'int',
        isStandardLibrary: true
      },
      {
        name: 'strlen',
        params: [{ name: 'str', type: 'char*' }],
        returnType: 'int',
        isStandardLibrary: true
      },
      {
        name: 'strcpy',
        params: [
          { name: 'dest', type: 'char*' },
          { name: 'src', type: 'char*' }
        ],
        returnType: 'char*',
        isStandardLibrary: true
      },
      {
        name: 'malloc',
        params: [{ name: 'size', type: 'int' }],
        returnType: 'void*',
        isStandardLibrary: true
      },
      {
        name: 'free',
        params: [{ name: 'ptr', type: 'void*' }],
        returnType: 'void',
        isStandardLibrary: true
      },
      {
        name: 'exit',
        params: [{ name: 'status', type: 'int' }],
        returnType: 'void',
        isStandardLibrary: true
      }
    ];

    for (const fn of stdlibFunctions) {
      console.log('Adding stdlib function:', fn);
      this.functionTable.set(fn.name, fn);
    }

    console.log('Function table after adding stdlib:', Array.from(this.functionTable.entries()));
  }

  constructor() {
    this.addStandardLibraryFunctions();
  }

  analyze(ast: any): { symbolTable: Map<string, any>; functionTable: Map<string, any>; errors: string[] } {
    console.log('Starting semantic analysis...');
    this.symbolTable = new Map();
    this.functionTable = new Map();
    this.globalSymbolTable = new Map();
    this.errors = [];
    
    // Add standard library functions first
    this.addStandardLibraryFunctions();
    
    console.log('After adding stdlib, function table has:', 
      Array.from(this.functionTable.entries()));

    if (ast && ast.type === 'Program') {
      console.log('Analyzing program with', ast.body?.length, 'nodes');
      console.log('AST body:', JSON.stringify(ast.body, null, 2));
      
      // First pass: process all function declarations
      for (const node of ast.body) {
        if (node?.type === 'FunctionDeclaration') {
          console.log('Found function declaration:', node.name);
          this.analyzeFunction(node);
        }
      }
      
      // Second pass: process other nodes
      for (const node of ast.body) {
        if (node?.type === 'FunctionCall') {
          console.log('Found function call:', node.name);
          // Handle function calls if needed
        } else if (node?.type !== 'FunctionDeclaration') {
          console.log('Processing other node type:', node?.type);
        }
      }
      
      console.log('Final function table:', Array.from(this.functionTable.entries()));
    } else {
      console.log('Invalid AST or not a Program node:', ast?.type);
    }

    return {
      symbolTable: this.globalSymbolTable,
      functionTable: this.functionTable,
      errors: this.errors
    };
  }

  private analyzeFunction(node: any) {
    const prevScope = this.currentFunctionScope;
    this.currentFunctionScope = node.name || 'anonymous';
    if (!node) {
      console.log('Invalid function node');
      return;
    }
    
    const funcName = node.name || 'anonymous';
    console.log('=== Analyzing function:', funcName, '===');
    
    // Log detailed function information
    console.log('Function node structure:', JSON.stringify({
      type: node.type,
      name: node.name,
      returnType: node.returnType,
      parameters: node.parameters,
      body: node.body ? '{...}' : 'none'
    }, null, 2));

    // Process function parameters
    const params = [];
    if (Array.isArray(node.parameters)) {
      console.log(`Found ${node.parameters.length} parameters`);
      node.parameters.forEach((param: any, index: number) => {
        const paramInfo = {
          name: param?.paramName || `param${index}`,
          type: param?.paramType || 'int',
          isParam: true
        };
        console.log(`Parameter ${index}:`, paramInfo);
        params.push(paramInfo);
        // Also add to global symbol table
        this.globalSymbolTable.set(paramInfo.name, {
          ...paramInfo,
          scope: funcName,
          line: node.loc?.start?.line
        });
      });
    } else {
      console.log('No parameters found');
    }

    // Create function info object
    const returnType = node.returnType || 'int';
    const functionInfo = {
      name: funcName,
      params: [...params],
      returnType: returnType,
      isStandardLibrary: false
    };
    
    console.log('Prepared function info:', JSON.stringify(functionInfo, null, 2));
    
    // Add to function table
    console.log(`Adding function '${funcName}' to function table`);
    this.functionTable.set(funcName, functionInfo);
    
    // Verify the function was added
    console.log(`Function table now has ${this.functionTable.size} entries`);
    console.log('Current function table:', Array.from(this.functionTable.entries()));

    // Create new scope for function body
    const oldSymbolTable = new Map(this.symbolTable);
    this.symbolTable = new Map();

    // Add parameters to symbol table
    for (const param of params) {
      const symbolInfo = {
        name: param.name,
        type: param.type,
        scope: funcName,
        isParam: true,
        line: node.loc?.start?.line
      };
      console.log('Adding parameter to symbol table:', symbolInfo);
      this.symbolTable.set(param.name, symbolInfo);
    }

    // Analyze function body
    if (node.body && node.body.type === 'CompoundStatement') {
      // Collect all variable declarations in the function body
      this.analyzeCompoundStatement(node.body);
      // After analyzing, add all symbols from the local symbol table to the global symbol table
      for (const [name, info] of this.symbolTable.entries()) {
        this.globalSymbolTable.set(name, {
          ...info,
          scope: funcName
        });
      }
    }

    // Restore old symbol table
    this.symbolTable = oldSymbolTable;
    this.currentFunctionScope = prevScope;
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
        this.analyzeCompoundStatement(stmt);
        break;
    }
  }

  private analyzeDeclaration(node: any) {
    for (const variable of node.variables) {
      if (this.symbolTable.has(variable.name)) {
        this.errors.push(`Variable '${variable.name}' already declared`);
      } else {
        const symbolInfo = {
          name: variable.name,
          type: node.varType || 'int', // Default to int if type not specified
          isParam: false,
          scope: this.currentFunctionScope || 'global'
        };
        this.symbolTable.set(variable.name, symbolInfo);
        this.globalSymbolTable.set(variable.name, symbolInfo);

        if (variable.initializer) {
          this.analyzeExpression(variable.initializer);
        }
      }
    }
  }

  private analyzeExpression(expr: any) {
    if (!expr) return;

    switch (expr.type) {
      case 'AssignmentExpression':
        this.analyzeAssignmentExpression(expr);
        break;
      case 'BinaryExpression':
        this.analyzeBinaryExpression(expr);
        break;
      case 'Identifier':
        this.analyzeIdentifier(expr);
        break;
      case 'Literal':
        this.analyzeLiteral(expr);
        break;
      case 'FunctionCall':
        this.analyzeFunctionCall(expr);
        break;
      case 'PrefixExpression':
      case 'PostfixExpression':
        this.analyzeUnaryExpression(expr);
        break;
    }
  }

  private analyzeAssignmentExpression(expr: any) {
    if (!this.symbolTable.has(expr.left.name)) {
      this.errors.push(`Variable '${expr.left.name}' not declared`);
    }
    this.analyzeExpression(expr.right);
  }

  private analyzeBinaryExpression(expr: any) {
    this.analyzeExpression(expr.left);
    this.analyzeExpression(expr.right);
  }

  private analyzeIdentifier(expr: any) {
    if (!this.symbolTable.has(expr.name)) {
      this.errors.push(`Variable '${expr.name}' not declared`);
    }
  }

  private analyzeLiteral(node: any) {
    // No analysis needed for literals
  }

  private analyzeFunctionCall(expr: any) {
    const func = this.functionTable.get(expr.name);
    if (!func) {
      this.errors.push(`Function '${expr.name}' not declared`);
      return;
    }

    // Skip parameter count check for printf as it's variadic
    if (expr.name !== 'printf') {
      if (expr.arguments.length !== func.params.length) {
        this.errors.push(`Function '${expr.name}' expects ${func.params.length} arguments but got ${expr.arguments.length}`);
      }
    }

    for (const arg of expr.arguments) {
      this.analyzeExpression(arg);
    }
  }

  private analyzeReturnStatement(node: any) {
    if (node.expression) {
      this.analyzeExpression(node.expression);
    }
  }

  private analyzeIfStatement(node: any) {
    this.analyzeExpression(node.condition);
    this.analyzeStatement(node.then);
    if (node.else) {
      this.analyzeStatement(node.else);
    }
  }

  private analyzeForStatement(node: any) {
    if (node.initialization) {
      this.analyzeStatement(node.initialization);
    }
    this.analyzeExpression(node.condition);
    if (node.increment) {
      this.analyzeExpression(node.increment);
    }
    this.analyzeStatement(node.body);
  }

  private analyzeUnaryExpression(expr: any) {
    this.analyzeExpression(expr.argument);
  }
} 