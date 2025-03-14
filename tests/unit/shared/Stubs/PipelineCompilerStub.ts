import type { IPipelineCompiler } from '@/application/Application/Loader/Collections/Compiler/Executable/Script/Compiler/Expressions/Pipes/IPipelineCompiler';

export class PipelineCompilerStub implements IPipelineCompiler {
  public compileHistory: Array<{ value: string, pipeline: string }> = [];

  public compile(value: string, pipeline: string): string {
    this.compileHistory.push({ value, pipeline });
    return `value: ${value}"\n${pipeline}: ${pipeline}`;
  }
}
