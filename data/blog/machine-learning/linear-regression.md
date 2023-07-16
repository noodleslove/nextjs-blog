---
title: 'Recaps of Machine Learning: Linear Regression'
date: '2023-07-15'
tags: ['machine learning', 'data science', 'notes', 'math']
lastmod: '2023-07-15'
draft: false
summary: Exploring linear regression and regularization techniques, this blog recaps the fundamental understanding of linear regression.
authors: ['eddieho', 'chatgpt']
---

<TOCInline toc={props.toc} asDisclosure />

## Introduction

![Machine Learning Regression](/static/images/ml-recaps/ml-regression.png)

In machine learning, regression is a supervised learning technique that focuses on predicting continuous numerical values based on input features or variables. It is a statistical modeling approach that aims to establish a relationship between the independent variables (features) and the dependent variable (target) by fitting a function to the observed data.

The goal of regression in machine learning is to build a predictive model that can accurately estimate or forecast the value of the target variable for new, unseen instances. This estimation is based on the patterns and relationships discovered in the training data.

Regression models make assumptions about the relationship between the independent variables and the dependent variable. The specific form of the relationship depends on the type of regression being used. Linear regression, for example, assumes a linear relationship, while other types of regression, such as polynomial regression or decision tree regression, allow for more complex relationships.

During the training process, regression models learn from the input data by adjusting their internal parameters to minimize the difference between the predicted values and the actual values of the target variable. The choice of an appropriate regression algorithm depends on the nature of the data and the problem at hand.

## Fundamentals of Linear Regression

Linear regression models establish a linear relationship between independent variables and a dependent variable, enabling predictions and insights based on observed data.

In linear regression, the dependent variable, also known as the target variable, is the variable we want to predict or explain. The independent variables, also called predictors or features, are the variables that help explain or predict the values of the target variable. The goal is to find the best-fitting line, known as the regression line, that represents the relationship between the predictors and the target variable.

To determine this line, linear regression employs the method of least squares, which minimizes the sum of the squared differences between the observed target values and the predicted values on the line. This approach ensures that the regression line optimally fits the given data points.

The regression line can be represented mathematically as:

$$\hat{y} = \beta_0 + \beta_1 x_1 + \beta_2 x_2 + \: ... \: + \beta_p x_p + \epsilon$$

Here, $y$ represents the target variable, $x_1$, $x_2$, ..., $x_p$ denote the independent variables, $\beta_0$ is the y-intercept, $\beta_1$, $\beta_2$, ..., $\beta_p$ are the coefficients or slopes corresponding to each independent variable, and $\epsilon$ is the error term accounting for the variability not captured by the model.

The coefficients ($\beta_0$, $\beta_1$, $\beta_2$, ..., $\beta_p$) in the regression equation represent the impact or contribution of each independent variable on the target variable. By estimating these coefficients, we gain insights into how changes in the predictors affect the target variable. A positive coefficient indicates a positive relationship, while a negative coefficient signifies a negative relationship.

Assumptions play a crucial role in linear regression. It assumes a linear relationship between the predictors and the target variable, meaning the relationship can be adequately represented by a straight line. Other assumptions include independence of errors, constant variance of errors (homoscedasticity), normally distributed errors, and absence of multicollinearity (high correlation) among predictors.

Evaluating the performance of a linear regression model involves various metrics, such as [R-squared (coefficient of determination)](https://en.wikipedia.org/wiki/Coefficient_of_determination) and [Mean Squared Error (MSE)](https://en.wikipedia.org/wiki/Mean_squared_error). R-squared measures the proportion of variance in the target variable explained by the model, while MSE quantifies the average squared difference between the predicted and actual values.

## Types of Linear Regression

Linear regression encompasses various types that extend the basic framework to handle different scenarios and complex relationships between variables. Here are explanations of two common types of linear regression: **Simple Linear Regression** and **Multiple Linear Regression**.

### Simple Linear Regression

Simple linear regression is the most basic form of linear regression, involving a single independent variable (predictor) and one dependent variable (target). It assumes a linear relationship between the predictor and the target, aiming to find the best-fitting line that represents their association. This line is determined by estimating the slope ($\beta_1$) and the y-intercept ($\beta_0$) using the method of least squares.

Simple linear regression is useful when we want to understand the relationship between two variables and make predictions based on that relationship. For instance, it can be employed to predict a person's salary based on their years of experience. The slope represents the average change in the target variable for each unit change in the predictor, while the y-intercept indicates the expected value of the target variable when the predictor is zero.

$$\hat{y} = \beta_0 + \beta_1 x$$

$\hat{y}$ is the predicted value of $y$ for a given $x$. This is the feature we are trying to estimate or predict. All $\hat{y}$ values fall on the linear regression line. $\beta_0$ and $\beta_1$ are the regression coefficients.

- $\beta_0$ is called the intercept. This is where the line intercepts the y-axis, and it’s equivalent to the predicted value of y when x=0
- $\beta_1$ is the coefficient of the input feature x, and it’s the slope of the line. It represents the effect x has on y. Therefore the linear regression model assumes that if $x$ increases by 1, $y$ increases by $\beta_1$ (This is only true when $x$ and $y$ have a perfect linear relationship, which is rarely the case)
- $\beta_0$ and $\beta_1$ are both learned from the dataset by the model.

Thus, when you fit a linear regression model, the job of the model is to estimate the best values for $\beta_0$ and $\beta_1$ based on your dataset.

### Multiple Linear Regression

Multiple linear regression extends simple linear regression by incorporating multiple independent variables (predictors) to model the relationship with a single dependent variable (target). This allows us to consider the influence of several factors simultaneously on the target variable. The equation for multiple linear regression is an extension of the simple linear regression equation:

$$\hat{y} = \beta_0 + \beta_1 x + \: ... \: + \beta_p x_p + \epsilon$$

Multiple linear regression enables us to explore the combined impact of multiple predictors on the target variable. For example, it can be used to predict house prices by considering factors such as the number of bedrooms, square footage, location, and other relevant variables. Each coefficient represents the expected change in the target variable for a unit change in the respective predictor, assuming other predictors remain constant.

Multiple linear regression also offers the ability to detect and account for multicollinearity, which occurs when predictors are highly correlated with each other. In such cases, the coefficients' interpretation may be affected, and techniques like [variance inflation factor (VIF)](https://en.wikipedia.org/wiki/Variance_inflation_factor) help identify and handle multicollinearity.

## Advanced Techniques and Variations

Regularization techniques come to the rescue by adding constraints to the regression equation, striking a balance between model complexity and accuracy. In this article, we explore two popular regularization methods: **Ridge Regression** and **Lasso Regression**.

### Ridge Regression

Ridge Regression, also known as Tikhonov regularization, adds a penalty term to the regression equation to shrink the coefficient estimates towards zero. This penalty term, controlled by the hyperparameter $\lambda$ (lambda), encourages smaller and more balanced coefficient values. The modified equation for Ridge Regression is:

$$\hat{y} = \beta_0 + \beta_1 x_1 + \beta_2 x_2 + \: ... \: + \beta_p x_p + \epsilon + \lambda \sum{\beta_i^2} + \epsilon$$

The regularization term, $\sum{\beta_i^2}$, ensures that the sum of squared coefficients remains small. By shrinking the coefficients, Ridge Regression reduces the model’s sensitivity to the training data and helps mitigate multicollinearity issues. It works particularly well when dealing with datasets with high dimensionality or when predictors are highly correlated.

### Lasso Regression

Lasso Regression (Least Absolute Shrinkage and Selection Operator) also introduces a penalty term, but with a slightly different approach. It adds the absolute values of the coefficients as a penalty to the regression equation:

$$\hat{y} = \beta_0 + \beta_1 x_1 + \beta_2 x_2 + \: ... \: + \beta_p x_p + \epsilon + \lambda \sum{|\beta_i|} + \epsilon$$

The key distinction from Ridge Regression is that Lasso Regression can drive some coefficients to exactly zero. This property facilitates automatic feature selection, as variables with zero coefficients are effectively excluded from the model. Lasso Regression is beneficial when dealing with datasets containing many predictors, as it can identify the most relevant variables and provide a more interpretable model.

## Conclusion

Linear regression serves as a fundamental tool in machine learning, allowing us to model relationships, make predictions, and gain insights from data. By understanding the basics of simple linear regression and multiple linear regression, we can analyze the impact of independent variables on the dependent variable and leverage these models for prediction tasks.

However, linear regression models are not immune to overfitting, where they become too complex and overly sensitive to the training data. That's where regularization techniques, such as Ridge Regression and Lasso Regression, come into play. These methods introduce penalties to the regression equation, controlling the complexity of the model and addressing overfitting issues. Ridge Regression shrinks the coefficients towards zero, while Lasso Regression can drive some coefficients to exactly zero, facilitating feature selection.

Regularization techniques offer valuable solutions for achieving a balance between model complexity and performance. By tuning the regularization parameter, we can control the amount of shrinkage and strike the optimal trade-off between bias and variance in our models. Incorporating these techniques into our linear regression models enhances their generalization ability, improving predictions on unseen data and reducing the risk of overfitting.

**References:**

⭐️ [Linear Regression, Clearly Explained!!!](https://www.youtube.com/watch?v=nk2CQITm_eo&ab_channel=StatQuestwithJoshStarmer)

[Coefficient of Determination](https://en.wikipedia.org/wiki/Coefficient_of_determination)

[Mean Squared Error](https://en.wikipedia.org/wiki/Mean_squared_error)

[Variance Inflation Factor](https://en.wikipedia.org/wiki/Variance_inflation_factor)
