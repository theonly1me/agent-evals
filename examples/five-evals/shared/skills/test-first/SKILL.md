---
name: test-first
description: Use when you implement or change code from a written specification, an exercise, or a list of requirements. Write tests from the specification first, then implement until they pass.
---

# Test first

1. Read the whole specification. List each rule, each edge case, and each error that it names, with the exact error type and message.
2. Write a test file next to the code. Give each item in the list one test. Name the file `test_<module>.py`.
3. Run the tests and see them fail.
4. Implement the code until every test passes. Do not change a test to make it pass unless the test is wrong about the specification.
5. Before you finish, run the tests one more time. Then check the specification again for a rule that has no test.
