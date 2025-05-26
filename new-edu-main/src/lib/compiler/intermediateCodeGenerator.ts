import { SemanticAnalyzer } from './semanticAnalyzer';

// Types for Three-Address Code
export type TACInstruction = {
  op: string;
  arg1: string | null;
  arg2: string | null;
  result: string | null;
  label?: string;
};

export type TACFunction = {
  name: string;
  params: string[];
  instructions: TACInstruction[];
  tempCount: number;
};

export class IntermediateCodeGenerator {
  private currentFunction: TACFunction | null = null;
  private tempCounter: number = 0;
  private labelCounter: number = 0;
  private functions: Map<string, TACFunction> = new Map();
  private semanticAnalyzer: SemanticAnalyzer;

  constructor(semanticAnalyzer: SemanticAnalyzer) {
    this.semanticAnalyzer = semanticAnalyzer;
  }

  generate(ast: any): Map<string, TACFunction> {
    this.functions.clear();
    this.tempCounter = 0;
    this.labelCounter = 0;

    if (ast && ast.type === 'Program') {
      for (const node of ast.body) {
        if (node.type === 'FunctionDeclaration') {
          this.generateFunction(node);
        }
      }
    }

    return this.functions;
  }

  private generateFunction(node: any) {
    const funcName = node.name;
    const params = node.parameters.map((param: any) => param.paramName);
    
    this.currentFunction = {
      name: funcName,
      params,
      instructions: [],
      tempCount: 0
    };

    // Generate function entry label
    this.emitInstruction('LABEL', null, null, `func_${funcName}`);
    
    // Generate function body
    if (node.body && node.body.type === 'CompoundStatement') {
      this.generateCompoundStatement(node.body);
    }

    // Add function to map
    if (this.currentFunction) {
      this.functions.set(funcName, this.currentFunction);
    }

    this.currentFunction = null;
  }

  private generateCompoundStatement(node: any) {
    if (!node.body) return;
    
    for (const stmt of node.body) {
      this.generateStatement(stmt);
    }
  }

  private generateStatement(stmt: any) {
    if (!stmt) return;
    
    switch (stmt.type) {
      case 'DeclarationStatement':
        this.generateDeclaration(stmt);
        break;
      case 'ExpressionStatement':
        this.generateExpression(stmt.expression);
        break;
      case 'ReturnStatement':
        this.generateReturnStatement(stmt);
        break;
      case 'IfStatement':
        this.generateIfStatement(stmt);
        break;
      case 'ForStatement':
        this.generateForStatement(stmt);
        break;
      case 'CompoundStatement':
        this.generateCompoundStatement(stmt);
        break;
    }
  }

  private generateDeclaration(node: any) {
    for (const variable of node.variables) {
      if (variable.initializer) {
        const temp = this.generateExpression(variable.initializer);
        this.emitInstruction('=', temp, null, variable.name);
      }
    }
  }

  private generateExpression(expr: any): string {
    if (!expr) return '';

    switch (expr.type) {
      case 'AssignmentExpression':
        return this.generateAssignmentExpression(expr);
      case 'BinaryExpression':
        return this.generateBinaryExpression(expr);
      case 'Identifier':
        return expr.name;
      case 'Literal':
        return this.generateLiteral(expr);
      case 'FunctionCall':
        return this.generateFunctionCall(expr);
      case 'PrefixExpression':
      case 'PostfixExpression':
        return this.generateUnaryExpression(expr);
      default:
        return '';
    }
  }

  private generateAssignmentExpression(expr: any): string {
    const rightTemp = this.generateExpression(expr.right);
    this.emitInstruction('=', rightTemp, null, expr.left.name);
    return expr.left.name;
  }

  private generateBinaryExpression(expr: any): string {
    const leftTemp = this.generateExpression(expr.left);
    const rightTemp = this.generateExpression(expr.right);
    const resultTemp = this.newTemp();

    this.emitInstruction(expr.operator, leftTemp, rightTemp, resultTemp);
    return resultTemp;
  }

  private generateLiteral(node: any): string {
    const temp = this.newTemp();
    this.emitInstruction('=', node.value.toString(), null, temp);
    return temp;
  }

  private generateFunctionCall(expr: any): string {
    const args = expr.arguments.map((arg: any) => this.generateExpression(arg));
    const resultTemp = this.newTemp();

    // Push arguments
    for (const arg of args) {
      this.emitInstruction('PARAM', arg, null, null);
    }

    // Call function
    this.emitInstruction('CALL', expr.name, args.length.toString(), resultTemp);
    return resultTemp;
  }

  private generateReturnStatement(node: any) {
    if (node.expression) {
      const temp = this.generateExpression(node.expression);
      this.emitInstruction('RETURN', temp, null, null);
    } else {
      this.emitInstruction('RETURN', null, null, null);
    }
  }

  private generateIfStatement(node: any) {
    const conditionTemp = this.generateExpression(node.condition);
    const elseLabel = this.newLabel();
    const endLabel = this.newLabel();

    // Jump to else if condition is false
    this.emitInstruction('IF_FALSE', conditionTemp, elseLabel, null);

    // Generate then block
    this.generateStatement(node.then);

    // Jump to end
    this.emitInstruction('GOTO', endLabel, null, null);

    // Else label
    this.emitInstruction('LABEL', null, null, elseLabel);

    // Generate else block if it exists
    if (node.else) {
      this.generateStatement(node.else);
    }

    // End label
    this.emitInstruction('LABEL', null, null, endLabel);
  }

  private generateForStatement(node: any) {
    const startLabel = this.newLabel();
    const conditionLabel = this.newLabel();
    const incrementLabel = this.newLabel();
    const endLabel = this.newLabel();

    // Generate initialization
    if (node.initialization) {
      this.generateStatement(node.initialization);
    }

    // Start label
    this.emitInstruction('LABEL', null, null, startLabel);

    // Generate condition
    const conditionTemp = this.generateExpression(node.condition);
    this.emitInstruction('IF_FALSE', conditionTemp, endLabel, null);

    // Generate body
    this.generateStatement(node.body);

    // Increment label
    this.emitInstruction('LABEL', null, null, incrementLabel);

    // Generate increment
    if (node.increment) {
      this.generateExpression(node.increment);
    }

    // Jump back to start
    this.emitInstruction('GOTO', startLabel, null, null);

    // End label
    this.emitInstruction('LABEL', null, null, endLabel);
  }

  private generateUnaryExpression(expr: any): string {
    const operandTemp = this.generateExpression(expr.argument);
    const resultTemp = this.newTemp();

    if (expr.operator === '++' || expr.operator === '--') {
      const op = expr.operator === '++' ? '+' : '-';
      this.emitInstruction(op, operandTemp, '1', resultTemp);
      this.emitInstruction('=', resultTemp, null, expr.argument.name);
      return expr.prefix ? resultTemp : operandTemp;
    } else {
      this.emitInstruction(expr.operator, operandTemp, null, resultTemp);
      return resultTemp;
    }
  }

  private emitInstruction(op: string, arg1: string | null, arg2: string | null, result: string | null) {
    if (this.currentFunction) {
      this.currentFunction.instructions.push({ op, arg1, arg2, result });
    }
  }

  private newTemp(): string {
    if (this.currentFunction) {
      this.currentFunction.tempCount++;
      return `t${this.currentFunction.tempCount}`;
    }
    return '';
  }

  private newLabel(): string {
    return `L${++this.labelCounter}`;
  }
}

// Helper function to format TAC for display
export function formatTAC(functions: Map<string, TACFunction>): string {
  let output = '';
  
  for (const [funcName, func] of functions) {
    output += `Function: ${funcName}\n`;
    output += `Parameters: ${func.params.join(', ')}\n\n`;
    
    for (const instr of func.instructions) {
      if (instr.label) {
        output += `${instr.label}:\n`;
      }
      
      if (instr.op === 'LABEL') {
        output += `${instr.result}:\n`;
      } else if (instr.op === 'IF_FALSE') {
        output += `    if ${instr.arg1} == 0 goto ${instr.arg2}\n`;
      } else if (instr.op === 'GOTO') {
        output += `    goto ${instr.arg1}\n`;
      } else if (instr.op === 'PARAM') {
        output += `    param ${instr.arg1}\n`;
      } else if (instr.op === 'CALL') {
        output += `    ${instr.result} = call ${instr.arg1}, ${instr.arg2}\n`;
      } else if (instr.op === 'RETURN') {
        output += `    return ${instr.arg1 || ''}\n`;
      } else if (instr.op === '=') {
        output += `    ${instr.result} = ${instr.arg1}\n`;
      } else {
        output += `    ${instr.result} = ${instr.arg1} ${instr.op} ${instr.arg2}\n`;
      }
    }
    
    output += '\n';
  }
  
  return output;
} 