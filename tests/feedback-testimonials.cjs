const fs=require('node:fs');
const vm=require('node:vm');

const customerHtml=fs.readFileSync('index.html','utf8');
const customerJs=fs.readFileSync('js/feedback-testimonials.js','utf8');
const adminHtml=fs.readFileSync('admin/index.html','utf8');
const adminJs=fs.readFileSync('admin/feedback-testimonials.js','utf8');

new vm.Script(customerJs,{filename:'js/feedback-testimonials.js'});
new vm.Script(adminJs,{filename:'admin/feedback-testimonials.js'});

const once=(source,needle,label)=>{
  const count=source.split(needle).length-1;
  if(count!==1)throw new Error(label+' expected once, found '+count);
};

once(customerHtml,'id="openFeedbackTestimonials"','Feedback quick link');
once(customerHtml,'id="feedbackTestimonialsModal"','Feedback modal');
once(customerHtml,'id="customerFeedbackTestimonialForm"','Feedback submission form');
once(customerHtml,'id="publicFeedbackTestimonialsList"','Public feedback list');
once(customerHtml,'js/feedback-testimonials.js?v=feedback-testimonials-v1','Customer feedback script');
once(adminHtml,'id="sidebarFeedbackCount"','Admin feedback pending badge');
once(adminHtml,'id="adminFeedbackList"','Admin feedback moderation list');
once(adminHtml,'id="adminFeedbackStatusFilter"','Admin feedback filter');
once(adminHtml,'feedback-testimonials.js?v=feedback-testimonials-v1','Admin feedback script');

const customerRpcMarkers=[
  "public_list_customer_feedback_testimonials",
  "customer_list_own_feedback_testimonials",
  "customer_submit_feedback_testimonial"
];
for(const marker of customerRpcMarkers){
  if(!customerJs.includes(marker))throw new Error('Missing customer feedback RPC: '+marker);
}
if(!adminJs.includes("admin_list_customer_feedback_testimonials"))throw new Error('Missing Admin feedback list RPC');
if(!adminJs.includes("admin_moderate_customer_feedback_testimonial"))throw new Error('Missing Admin feedback moderation RPC');

console.log('feedback/testimonials regression checks passed');
