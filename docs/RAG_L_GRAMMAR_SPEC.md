# RAG-L Domain Specific Language Grammar Specification

## EBNF Grammar Definition
```ebnf
Expression   ::= Assertion (LogicalOp Assertion)*
Assertion    ::= Metric TargetOp Threshold
Metric       ::= 'faithfulness' | 'answer_relevance' | 'context_recall' | 'semantic_overlap'
TargetOp     ::= '>=' | '<=' | '==' | '!='
Threshold    ::= FloatLiteral
LogicalOp    ::= 'AND' | 'OR'
```

## Example Statements
```text
ASSERT faithfulness >= 0.95 AND context_recall >= 0.90;
```
