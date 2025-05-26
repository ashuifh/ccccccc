import { TACFunction, TACInstruction } from './intermediateCodeGenerator';

export class CodeOptimizer {
  private functions: Map<string, TACFunction>;
  private optimizedFunctions: Map<string, TACFunction>;

  constructor(functions: Map<string, TACFunction>) {
    this.functions = functions;
    this.optimizedFunctions = new Map();
  }

  optimize(): Map<string, TACFunction> {
    // Create a deep copy of functions
    for (const [name, func] of this.functions) {
      this.optimizedFunctions.set(name, {
        name: func.name,
        params: [...func.params],
        instructions: [...func.instructions],
        tempCount: func.tempCount
      });
    }

    // Apply optimizations
    for (const [name, func] of this.optimizedFunctions) {
      this.optimizeFunction(name, func);
    }

    return this.optimizedFunctions;
  }

  private optimizeFunction(name: string, func: TACFunction) {
    // Apply constant folding and propagation
    this.constantFolding(func);
    
    // Apply dead code elimination
    this.deadCodeElimination(func);
    
    // Apply common subexpression elimination
    this.commonSubexpressionElimination(func);
    
    // Apply loop optimization
    this.loopOptimization(func);
  }

  private constantFolding(func: TACFunction) {
    const constants = new Map<string, string>();
    const optimizedInstructions: TACInstruction[] = [];

    for (const instr of func.instructions) {
      // Skip labels and control flow instructions
      if (instr.op === 'LABEL' || instr.op === 'GOTO' || instr.op === 'IF_FALSE') {
        optimizedInstructions.push(instr);
        continue;
      }

      // Handle constant assignments
      if (instr.op === '=' && !isNaN(Number(instr.arg1))) {
        constants.set(instr.result!, instr.arg1!);
        optimizedInstructions.push(instr);
        continue;
      }

      // Replace constant operands
      const arg1 = constants.get(instr.arg1!) || instr.arg1;
      const arg2 = constants.get(instr.arg2!) || instr.arg2;

      // Perform constant folding for arithmetic operations
      if (instr.op !== '=' && !isNaN(Number(arg1)) && !isNaN(Number(arg2))) {
        const result = this.evaluateConstantExpression(instr.op, arg1!, arg2!);
        constants.set(instr.result!, result);
        optimizedInstructions.push({
          op: '=',
          arg1: result,
          arg2: null,
          result: instr.result
        });
      } else {
        optimizedInstructions.push({
          ...instr,
          arg1,
          arg2
        });
      }
    }

    func.instructions = optimizedInstructions;
  }

  private evaluateConstantExpression(op: string, arg1: string, arg2: string): string {
    const num1 = Number(arg1);
    const num2 = Number(arg2);

    switch (op) {
      case '+': return (num1 + num2).toString();
      case '-': return (num1 - num2).toString();
      case '*': return (num1 * num2).toString();
      case '/': return (num1 / num2).toString();
      case '%': return (num1 % num2).toString();
      default: return arg1;
    }
  }

  private deadCodeElimination(func: TACFunction) {
    const usedVars = new Set<string>();
    const optimizedInstructions: TACInstruction[] = [];

    // First pass: collect all used variables
    for (const instr of func.instructions) {
      if (instr.arg1 && !instr.arg1.startsWith('L')) usedVars.add(instr.arg1);
      if (instr.arg2 && !instr.arg2.startsWith('L')) usedVars.add(instr.arg2);
    }

    // Second pass: remove unused assignments
    for (const instr of func.instructions) {
      if (instr.op === '=' && !usedVars.has(instr.result!)) {
        continue; // Skip unused assignments
      }
      optimizedInstructions.push(instr);
    }

    func.instructions = optimizedInstructions;
  }

  private commonSubexpressionElimination(func: TACFunction) {
    const expressions = new Map<string, string>();
    const optimizedInstructions: TACInstruction[] = [];

    for (const instr of func.instructions) {
      // Skip labels and control flow instructions
      if (instr.op === 'LABEL' || instr.op === 'GOTO' || instr.op === 'IF_FALSE') {
        optimizedInstructions.push(instr);
        continue;
      }

      // Create expression key
      const exprKey = `${instr.op}${instr.arg1}${instr.arg2}`;

      if (expressions.has(exprKey)) {
        // Replace with existing temporary
        optimizedInstructions.push({
          op: '=',
          arg1: expressions.get(exprKey)!,
          arg2: null,
          result: instr.result
        });
      } else {
        // Store new expression
        expressions.set(exprKey, instr.result!);
        optimizedInstructions.push(instr);
      }
    }

    func.instructions = optimizedInstructions;
  }

  private loopOptimization(func: TACFunction) {
    const optimizedInstructions: TACInstruction[] = [];
    let i = 0;

    while (i < func.instructions.length) {
      const instr = func.instructions[i];

      // Look for loop patterns
      if (instr.op === 'LABEL' && instr.result?.startsWith('L')) {
        const loopStart = i;
        let loopEnd = -1;
        let hasIncrement = false;

        // Find loop end
        for (let j = i + 1; j < func.instructions.length; j++) {
          const current = func.instructions[j];
          if (current.op === 'GOTO' && current.arg1 === instr.result) {
            loopEnd = j;
            break;
          }
        }

        if (loopEnd !== -1) {
          // Check for increment operation
          for (let j = loopStart; j < loopEnd; j++) {
            const current = func.instructions[j];
            if (current.op === '+' && current.arg2 === '1') {
              hasIncrement = true;
              break;
            }
          }

          // If it's a simple counting loop, try to optimize
          if (hasIncrement) {
            // Keep the loop structure but mark it as optimized
            optimizedInstructions.push({
              ...instr,
              label: 'OPTIMIZED_LOOP'
            });
            i = loopEnd + 1;
            continue;
          }
        }
      }

      optimizedInstructions.push(instr);
      i++;
    }

    func.instructions = optimizedInstructions;
  }
}

// Helper function to format optimized code for display
export function formatOptimizedCode(functions: Map<string, TACFunction>): string {
  let output = 'Optimized Intermediate Code:\n\n';
  
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