export function greet(name: string): string {
  return `Hello, ${name}!`;
}

if (import.meta.main) {
  const [name = "Deno"] = Deno.args;
  console.log(greet(name));
}
