import { TACFunction } from './intermediateCodeGenerator';

export class CodeGenerator {
  private functions: Map<string, TACFunction>;
  private assembly: string[];
  private currentFunction: string | null = null;
  private labelCounter: number = 0;
  private stackOffset: number = 0;
  private localVars: Map<string, number> = new Map();
  private paramCount: number = 0;

  constructor(functions: Map<string, TACFunction>) {
    this.functions = functions;
    this.assembly = [];
  }

  generate(): string {
    this.assembly = [];
    
    // Add data section
    this.assembly.push('section .data');
    this.assembly.push('    format_int db "%d", 10, 0    ; Format string for integers');
    this.assembly.push('    format_float db "%f", 10, 0  ; Format string for floats');
    this.assembly.push('    format_string db "%s", 10, 0 ; Format string for strings');
    this.assembly.push('');

    // Add text section
    this.assembly.push('section .text');
    this.assembly.push('    global main');
    this.assembly.push('    extern printf');
    this.assembly.push('    extern scanf');
    this.assembly.push('');

    // Generate code for each function
    for (const [name, func] of this.functions) {
      this.generateFunction(name, func);
    }

    return this.assembly.join('\n');
  }

  private generateFunction(name: string, func: TACFunction) {
    this.currentFunction = name;
    this.stackOffset = 0;
    this.localVars.clear();
    this.paramCount = func.params.length;

    // Function prologue
    this.assembly.push(`; Function: ${name}`);
    this.assembly.push(`${name}:`);
    this.assembly.push('    push ebp');
    this.assembly.push('    mov ebp, esp');
    
    // Allocate space for local variables
    const localVarSize = func.tempCount * 4;
    if (localVarSize > 0) {
      this.assembly.push(`    sub esp, ${localVarSize}`);
    }

    // Save parameters to local variables
    for (let i = 0; i < func.params.length; i++) {
      const paramOffset = 8 + i * 4; // Parameters are at [ebp+8], [ebp+12], etc.
      this.allocateLocalVar(func.params[i], paramOffset);
    }

    // Generate code for each instruction
    for (const instr of func.instructions) {
      this.generateInstruction(instr);
    }

    // Function epilogue
    this.assembly.push('    mov esp, ebp');
    this.assembly.push('    pop ebp');
    this.assembly.push('    ret');
    this.assembly.push('');
  }

  private generateInstruction(instr: any) {
    if (instr.label) {
      this.assembly.push(`${instr.label}:`);
    }

    switch (instr.op) {
      case 'LABEL':
        this.assembly.push(`${instr.result}:`);
        break;

      case '=':
        this.generateAssignment(instr);
        break;

      case '+':
      case '-':
      case '*':
      case '/':
      case '%':
        this.generateArithmetic(instr);
        break;

      case 'IF_FALSE':
        this.generateConditionalJump(instr);
        break;

      case 'GOTO':
        this.assembly.push(`    jmp ${instr.arg1}`);
        break;

      case 'PARAM':
        this.generateParameter(instr);
        break;

      case 'CALL':
        this.generateFunctionCall(instr);
        break;

      case 'RETURN':
        this.generateReturn(instr);
        break;
    }
  }

  private generateAssignment(instr: any) {
    const dest = this.getOperandLocation(instr.result);
    const src = this.getOperandLocation(instr.arg1);

    if (src.startsWith('[')) {
      // Source is in memory
      this.assembly.push('    mov eax, ' + src);
      this.assembly.push('    mov ' + dest + ', eax');
    } else {
      // Source is immediate or register
      this.assembly.push('    mov ' + dest + ', ' + src);
    }
  }

  private generateArithmetic(instr: any) {
    const dest = this.getOperandLocation(instr.result);
    const left = this.getOperandLocation(instr.arg1);
    const right = this.getOperandLocation(instr.arg2);

    // Load left operand into eax
    if (left.startsWith('[')) {
      this.assembly.push('    mov eax, ' + left);
    } else {
      this.assembly.push('    mov eax, ' + left);
    }

    // Perform operation
    switch (instr.op) {
      case '+':
        this.assembly.push('    add eax, ' + right);
        break;
      case '-':
        this.assembly.push('    sub eax, ' + right);
        break;
      case '*':
        this.assembly.push('    imul eax, ' + right);
        break;
      case '/':
        this.assembly.push('    cdq'); // Sign extend eax into edx
        this.assembly.push('    idiv ' + right);
        break;
      case '%':
        this.assembly.push('    cdq');
        this.assembly.push('    idiv ' + right);
        this.assembly.push('    mov eax, edx'); // Remainder is in edx
        break;
    }

    // Store result
    this.assembly.push('    mov ' + dest + ', eax');
  }

  private generateConditionalJump(instr: any) {
    const condition = this.getOperandLocation(instr.arg1);
    const label = instr.arg2;

    this.assembly.push('    cmp ' + condition + ', 0');
    this.assembly.push('    je ' + label);
  }

  private generateParameter(instr: any) {
    const param = this.getOperandLocation(instr.arg1);
    this.assembly.push('    push ' + param);
  }

  private generateFunctionCall(instr: any) {
    const funcName = instr.arg1;
    const argCount = parseInt(instr.arg2);
    const result = this.getOperandLocation(instr.result);

    // Call function
    this.assembly.push('    call ' + funcName);

    // Clean up stack (remove parameters)
    if (argCount > 0) {
      this.assembly.push(`    add esp, ${argCount * 4}`);
    }

    // Store result if needed
    if (result) {
      this.assembly.push('    mov ' + result + ', eax');
    }
  }

  private generateReturn(instr: any) {
    if (instr.arg1) {
      const value = this.getOperandLocation(instr.arg1);
      this.assembly.push('    mov eax, ' + value);
    }
    this.assembly.push('    jmp ' + this.currentFunction + '_end');
  }

  private getOperandLocation(operand: string | null): string {
    if (!operand) return '';

    // Check if it's a number
    if (!isNaN(Number(operand))) {
      return operand;
    }

    // Check if it's a local variable
    const offset = this.localVars.get(operand);
    if (offset !== undefined) {
      return `[ebp${offset >= 0 ? '+' : ''}${offset}]`;
    }

    // Check if it's a parameter
    const paramIndex = this.functions.get(this.currentFunction!)?.params.indexOf(operand);
    if (paramIndex !== -1) {
      return `[ebp+${8 + paramIndex * 4}]`;
    }

    // Must be a label
    return operand;
  }

  private allocateLocalVar(name: string, initialOffset?: number): number {
    if (initialOffset !== undefined) {
      this.localVars.set(name, initialOffset);
      return initialOffset;
    }

    this.stackOffset -= 4;
    this.localVars.set(name, this.stackOffset);
    return this.stackOffset;
  }
}

// Helper function to format assembly code for display
export function formatAssembly(assembly: string): string {
  return 'Generated x86 Assembly Code:\n\n' + assembly;
} 