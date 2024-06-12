.PHONY: help
help:
	@LC_ALL=C $(MAKE) -pRrq -f $(firstword $(MAKEFILE_LIST)) : 2>/dev/null \
		| awk -v RS= -F: '/(^|\n)# Files(\n|$$)/,/(^|\n)# Finished Make database/ {if ($$1 !~ "^[#.]") {print $$1}}' \
		| sort \
		| egrep -v -e '^[^[:alnum:]]'
		-e '^$@$$'

# FILL THIS IN.
DETAIL_FOLDER = src/cli/detail

.PHONY: clean
clean:
	rm -f ./spans.jsonl
	rm -rf generated
	rm -rf ${DETAIL_FOLDER}/generated

.PHONY: generate
generate:
	npx @detail-dev/replay generate-tests -o ${DETAIL_FOLDER}/generated -i spans.jsonl -r generated/test_results
	npx @detail-dev/replay generate-env -o ${DETAIL_FOLDER}/generated

.PHONY: run
run:
	npx jest -i --config jest.detail.js --testPathPattern ${DETAIL_FOLDER}/generated

.PHONY: prune
prune:
	npx @detail-dev/replay prune -t ${DETAIL_FOLDER}/generated -r generated/test_results

.PHONY: summarize
summarize:
	npx @detail-dev/replay summarize -t ${DETAIL_FOLDER}/generated -r generated/test_results -o generated/summary.md
