ok now in the brain-dump-processor in the processShortBraindumpForExistingProject function, I want
this to be connected to the frontend and stream in data like we do with the dual processing flow.\
 \
 WE shouldnt show the dual processing in the ui, but we should show the task extraction first, and
when the tasks are extracted we should return those results to the frontend. and if we are also going
to process the project context then we should pop up the show context loading part from the dual
processing results.\
 \
 So the frontend needs to be linked to the braindump length check of 500 characters for this flow. If
the braindump is smaller than 500 characters then the ui should be ready for this flow. and when we
click process in the braindump modal it should launch a version of the TaskNotesPreview. and when the
tasks are processed they will be returned to the frontend. and depending on if the project context
is going to be processed then the ProjectContextPreview should show up and it should show a dual view
similar to the DualProcessingResults.\
 \
 If just tasks are needed to be loaded and no context then it should just show the tasknotespreview
and when it is done it should go to the regular view. If the context is being processed, then the
loading needs to wait till both are loaded.\
 \

- Ask me any questions before you get started so we have the right strategy for this.
- If you have confusing or under specified information please stop and ask for clarity before
  executing on workflows

One important thing is that this flow is only for updating existing projects which means it is associated with
a selectedProjectId and it is for when the braindump text is < 500 characters.
\
 the context processing decision comes from the prompt that we give to the llm. IN the
processShortBraindumpForExistingProject() a param is returned that determines if context should be processed-  
 taskResult.requiresContextUpdate\
 \
 if we are doing the are doing this flow this should follow a similar flow to
brainDumpService.parseBrainDumpWithStream and this ping this endpoint api/braindumps/stream, follow a similar
pattern.\
 \
 Reuse what you can from the dualprocessingresults but it needs to only show the tasks part first and
conditionally show the project context part if that is going to be processed.\
 \
 Wait for both to be finishd before allowing interaction.\
 \
 Do more research and ask any other clarifying questions you have before getting started

Lets adapt the DualProcessingResults to handle both flows.\
 \
 when only tasks are being processed, yes we should only show the tasknotespreview in a single column. And if
the data comes back that we need to process the project context too then the layout should update showing 2
panels and it should show the ProjectContextPreview loading.\
 \
 After processing complete transition into the regular parseresultsdiffview like normal.\
 \
 yes if the task extractino succeeds but the context processing fials allow the user to proceed with just the
tasks.
